'use server';

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import * as Sentry from '@sentry/nextjs';
import type { PostgrestError } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  DISCUSSION_FILE_BUCKET as STORAGE_BUCKET,
  DISCUSSION_FILE_SIZE_ERROR,
  DISCUSSION_FILE_TYPES,
  MAX_DISCUSSION_FILE_BYTES,
} from '@/lib/discussion-file';
import { getSupabaseServer } from '@/lib/supabase/server';
import { cleanupDetachedFile, cleanupIfMeetingDeleted, publicUrlToPath } from './_discussion-file-cleanup';
import { revalidateMeetingPaths } from './_revalidate-meeting';

const FILE_CHANGED = '모임 정보가 변경되었습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.';
const UPDATE_UNCONFIRMED = '파일 변경 결과를 확인하지 못했습니다. 페이지를 새로고침해 확인해주세요.';
const UPLOAD_EXPIRED = '업로드 요청이 만료되었거나 올바르지 않습니다. 파일을 다시 선택해주세요.';
const uploadMetadata = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().positive().max(MAX_DISCUSSION_FILE_BYTES, DISCUSSION_FILE_SIZE_ERROR),
  type: z.string().refine((type) => DISCUSSION_FILE_TYPES.includes(type)),
});

type UploadIntent = z.infer<typeof uploadMetadata> & {
  meetingId: string;
  hostId: string;
  path: string;
  previousUrl: string | null;
  previousUpdatedAt: string;
  expiresAt: number;
};

function uploadSignature(payload: string) {
  return createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY!)
    .update('discussion-file-upload:v1:')
    .update(payload)
    .digest();
}

function signUpload(intent: UploadIntent) {
  const payload = Buffer.from(JSON.stringify(intent)).toString('base64url');
  return `${payload}.${uploadSignature(payload).toString('base64url')}`;
}

function readUpload(ticket: string): UploadIntent | null {
  if (typeof ticket !== 'string' || ticket.length > 4096) return null;
  const [payload, signature, extra] = ticket.split('.');
  if (!payload || !signature || extra !== undefined) return null;
  const received = Buffer.from(signature, 'base64url');
  const expected = uploadSignature(payload);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  const intent = JSON.parse(Buffer.from(payload, 'base64url').toString()) as UploadIntent;
  return intent.expiresAt > Date.now() ? intent : null;
}

/**
 * Gemini 출력의 흔한 정렬 오류를 보정. prompt를 강화해도 가끔 발생.
 * - "**굵게**한글" → "**굵게**\n\n한글" (CommonMark spec상 ** 닫음 뒤 단어가
 *   붙으면 굵게 인식 안 됨 — 빈 줄 삽입으로 명확화)
 * - "문장.다음문장" → "문장. 다음문장" (마침표/물음표/느낌표 뒤 공백 없는 경우)
 */
function normalizeExtractedQuestion(s: string): string {
  let out = s.replace(/(\*\*[^*\n]+\*\*)(?=[가-힣A-Za-z])/g, '$1\n\n');
  out = out.replace(/([.!?])(?=[가-힣A-Z])/g, '$1 ');
  return out;
}

async function assertHost(meetingId: string) {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: '로그인이 필요합니다.', supabase: null };

  const { data: meeting, error } = await supabase
    .from('meetings')
    .select('host_id, discussion_file_url, updated_at')
    .eq('id', meetingId)
    .maybeSingle();
  if (error) return { ok: false as const, error: '모임을 찾을 수 없습니다.', supabase: null };
  if (!meeting) return { ok: false as const, error: '모임을 찾을 수 없습니다.', supabase: null, missingForUserId: user.id };
  if (meeting.host_id !== user.id) return { ok: false as const, error: '발제자만 사용할 수 있습니다.', supabase: null };

  return { ok: true as const, supabase, meeting };
}

type HostAccess = Extract<Awaited<ReturnType<typeof assertHost>>, { ok: true }>;

async function updateDiscussionFile(
  { supabase, meeting }: HostAccess,
  meetingId: string,
  url: string | null,
  fileName: string | null,
) {
  const update = supabase
    .from('meetings')
    .update({ discussion_file_url: url, discussion_file_name: fileName })
    .eq('id', meetingId)
    // Detect a file added and removed since a request read an empty slot.
    .eq('updated_at', meeting.updated_at);

  return (meeting.discussion_file_url === null
    ? update.is('discussion_file_url', null)
    : update.eq('discussion_file_url', meeting.discussion_file_url)
  ).select('id');
}

function isConfirmedRejection(error: PostgrestError | null, status: number): error is PostgrestError {
  // A structured client error from PostgREST confirms the write was rejected.
  return !!error && status >= 400 && status < 500 && /^(?:[A-Z0-9]{5}|PGRST\d{3})$/.test(error.code);
}

export async function prepareDiscussionFileUpload(
  meetingId: string,
  file: z.input<typeof uploadMetadata>,
  expectedUrl: string | null,
) {
  const auth = await assertHost(meetingId);
  if (!auth.ok) return { ok: false as const, error: auth.error };
  if (expectedUrl !== auth.meeting.discussion_file_url) {
    return { ok: false as const, error: FILE_CHANGED };
  }

  const metadata = uploadMetadata.safeParse(file);
  if (!metadata.success) {
    const tooLarge = metadata.error.issues.some((issue) => issue.message === DISCUSSION_FILE_SIZE_ERROR);
    return { ok: false as const, error: tooLarge ? DISCUSSION_FILE_SIZE_ERROR : '파일 이름, 크기 또는 형식을 확인해주세요.' };
  }

  const safeName = metadata.data.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${meetingId}/${randomUUID()}-${safeName}`;
  const { data, error } = await auth.supabase.storage.from(STORAGE_BUCKET).createSignedUploadUrl(path);
  if (error) return { ok: false as const, error: error.message };

  const ticket = signUpload({
    ...metadata.data,
    meetingId,
    hostId: auth.meeting.host_id,
    path,
    previousUrl: auth.meeting.discussion_file_url,
    previousUpdatedAt: auth.meeting.updated_at,
    expiresAt: Date.now() + 2 * 60 * 60 * 1000,
  });
  return { ok: true as const, path, token: data.token, ticket };
}

export async function finishDiscussionFileUpload(meetingId: string, ticket: string) {
  const auth = await assertHost(meetingId);
  if (!auth.ok) {
    if (auth.missingForUserId) {
      const intent = readUpload(ticket);
      if (intent?.meetingId === meetingId && intent.hostId === auth.missingForUserId) {
        await cleanupIfMeetingDeleted(meetingId, intent.path);
      }
    }
    return { ok: false as const, error: auth.error };
  }
  const intent = readUpload(ticket);
  if (!intent || intent.meetingId !== meetingId || intent.hostId !== auth.meeting.host_id) {
    return { ok: false as const, error: UPLOAD_EXPIRED };
  }
  const { supabase, meeting } = auth;
  const { path, name, previousUrl, previousUpdatedAt } = intent;
  const bucket = supabase.storage.from(STORAGE_BUCKET);
  const { data: { publicUrl } } = bucket.getPublicUrl(path);

  const stillCurrent = (row: { discussion_file_url: string | null; updated_at: string }) =>
    row.discussion_file_url === previousUrl && row.updated_at === previousUpdatedAt;
  const success = async () => {
    await cleanupDetachedFile(supabase, meetingId, publicUrlToPath(previousUrl, meetingId));
    await revalidateMeetingPaths(meetingId);
    return { ok: true as const, url: publicUrl, fileName: name };
  };

  if (meeting.discussion_file_url === publicUrl) return success();
  if (!stillCurrent(meeting)) {
    await cleanupDetachedFile(supabase, meetingId, path);
    return { ok: false as const, error: FILE_CHANGED };
  }

  const { data: file, error: fileError } = await bucket.info(path);
  if (fileError) {
    if (await cleanupIfMeetingDeleted(meetingId, path)) return { ok: false as const, error: FILE_CHANGED };
    return { ok: false as const, error: '업로드된 파일을 확인하지 못했습니다. 다시 시도해주세요.' };
  }
  if (file.size !== intent.size || file.contentType !== intent.type) {
    return { ok: false as const, error: '업로드된 파일의 크기 또는 형식이 일치하지 않습니다.' };
  }

  const { data: updated, error, status } = await updateDiscussionFile(auth, meetingId, publicUrl, name);
  if (updated?.length) return success();

  const { data: current, error: readError } = await supabase
    .from('meetings')
    .select('discussion_file_url, updated_at')
    .eq('id', meetingId)
    .maybeSingle();
  if (current?.discussion_file_url === publicUrl) return success();
  if (current && !stillCurrent(current)) {
    await cleanupDetachedFile(supabase, meetingId, path);
    return { ok: false as const, error: FILE_CHANGED };
  }
  if (!current && !readError && await cleanupIfMeetingDeleted(meetingId, path)) {
    return { ok: false as const, error: FILE_CHANGED };
  }

  // Another confirmation of the same upload can still commit against this snapshot.
  console.error('[discussion-files] Upload update unconfirmed', { path, error, readError });
  return { ok: false as const, error: isConfirmedRejection(error, status) ? error.message : UPDATE_UNCONFIRMED };
}

export async function removeDiscussionFile(meetingId: string, expectedUrl?: string | null) {
  const auth = await assertHost(meetingId);
  if (!auth.ok) return { ok: false as const, error: auth.error };
  if (expectedUrl !== undefined && expectedUrl !== auth.meeting.discussion_file_url) {
    return { ok: false as const, error: FILE_CHANGED };
  }
  const { data: updated, error, status } = await updateDiscussionFile(auth, meetingId, null, null);
  if (updated?.length === 0) return { ok: false as const, error: FILE_CHANGED };
  if (!updated?.length) {
    if (isConfirmedRejection(error, status)) return { ok: false as const, error: error.message };
    console.error('[discussion-files] Delete update unconfirmed', { meetingId, error });
    return { ok: false as const, error: UPDATE_UNCONFIRMED };
  }

  await cleanupDetachedFile(auth.supabase, meetingId, publicUrlToPath(auth.meeting.discussion_file_url, meetingId));
  await revalidateMeetingPaths(meetingId);
  return { ok: true as const };
}

export async function extractQuestionsFromPdf(meetingId: string, pdfUrl: string): Promise<
  { ok: true; questions: string[] } | { ok: false; error: string }
> {
  const auth = await assertHost(meetingId);
  if (!auth.ok) return { ok: false, error: auth.error };

  // SSRF guard: URL must be inside our Supabase storage bucket for THIS meeting
  const expectedPrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${meetingId}/`;
  if (!pdfUrl.startsWith(expectedPrefix)) {
    return { ok: false, error: '잘못된 파일 경로입니다.' };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, error: 'Gemini API 키가 설정되지 않았습니다.' };

  try {
    // Pre-check size via HEAD to avoid OOM on huge files
    const head = await fetch(pdfUrl, { method: 'HEAD' });
    if (!head.ok) return { ok: false, error: 'PDF를 가져오지 못했습니다.' };
    const contentLength = Number(head.headers.get('content-length') ?? '0');
    if (contentLength > MAX_DISCUSSION_FILE_BYTES) {
      return { ok: false, error: 'PDF가 너무 큽니다 (20MB 초과).' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000); // 60s timeout
    let pdfBase64: string;
    try {
      const res = await fetch(pdfUrl, { signal: controller.signal });
      if (!res.ok) return { ok: false, error: 'PDF를 가져오지 못했습니다.' };
      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_DISCUSSION_FILE_BYTES) {
        return { ok: false, error: 'PDF가 너무 큽니다 (20MB 초과).' };
      }
      pdfBase64 = Buffer.from(buf).toString('base64');
    } finally {
      clearTimeout(timeout);
    }

    const { GoogleGenAI, Type } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `이 PDF는 독서 모임의 발제문입니다. 번호가 매겨진 "토론 질문"만 추출해주세요.

[추출 대상 — 다음에 모두 해당해야 함]
1. 번호 마커("1.", "1)", "Q1.", "α.", "β." 등)로 시작
2. 모임 참여자에게 묻거나 답/공유를 유도하는 형태 (의문문 또는 "공유해주세요", "이야기해보고 싶습니다", "궁금합니다" 등)

[제외 — 위 조건을 만족해도 제외]
- 큰 섹션 헤더 자체 (예: "Intro.", "신나는 시청각자료 파트")
- 섹션 도입 설명문 (질문이 없는 일반 설명 문단)
- **단어 사전식 정의 목록** — 단어와 짧은 정의가 한 줄로 나열된 항목 (예: "1. 낭만 - 한국인의 정서", "2. Kilig - 설렘")
- **이미지/그림/카툰 안의 글자** — PDF 페이지에 삽입된 이미지에서 OCR된 텍스트는 절대 추출하지 마세요
- **머리말/꼬리말 자체** (페이지 상하단의 문서 제목 반복, 페이지 번호 단독 표기)

[페이지 출처 표기 — 반드시 보존]
- 본문/인용 안에 등장하는 페이지 출처 표기(예: "p.23", "(p.23)", "p.23-25", "23쪽")는 **삭제하지 말고 원래 위치 그대로 보존**
- 발제자가 어느 페이지의 내용인지 명시한 것이라 매우 중요

[항목 본문 구성 — 추출하기로 한 항목에 대해]
- **원본 PDF에 나타난 문장 순서를 정확히 그대로 유지하세요**. 질문이 항목 첫 줄에 있으면 결과에서도 첫 줄, 인용이 본문 가운데 있으면 가운데, 질문이 끝에 있으면 끝. **임의로 재배치 금지**
- 첫 줄에 소제목이 있으면 (예: "알레프 _ 창문", "「10 Things I Hate About You」(1999)") 마크다운 굵게 \`**소제목**\` 로 첫 줄에 배치
- 큰따옴표("..."), 일본식 괄호(「...」), 시 인용 등 인용문은 마크다운 인용구(\`> 인용내용\`)로 변환하여 별도 줄에 배치
- **원본 PDF에 항목 기호(\`-\`, \`•\`, \`*\`, \`①②③\`, \`㉠㉡\` 등)로 시작하는 sub-question 리스트가 있으면 마크다운 리스트(\`- \`)로 보존**. 각 리스트 아이템은 반드시 별도 줄.
- 번호 마커("1.", "α." 등) 자체는 결과 문자열에서 제거 (UI에서 자동 번호 매김)
- **본문 줄바꿈/단락 구분은 반드시 보존**: 소제목/본문/인용/리스트는 빈 줄로 구분. JSON 응답에서 줄바꿈은 \`\\n\`으로 표현 (소제목과 본문 사이 \`\\n\\n\`, 리스트 시작 직전 \`\\n\\n\`).
- 문장 사이 공백도 보존: \`드러납니다.여러분의\` 같이 마침표 뒤 공백 없이 다음 문장이 바로 붙는 형태는 금지. PDF의 원래 공백을 유지.

[변환 예시]

예시1 입력:
\`\`\`
1. 알레프 _ 창문
   창문과 문을 경계로 '문꾹닫'을 시전한 '나'가 어떤 심정인지 궁금했습니다.
\`\`\`
예시1 출력 (questions 배열의 한 항목):
\`\`\`
**알레프 _ 창문**

창문과 문을 경계로 '문꾹닫'을 시전한 '나'가 어떤 심정인지 궁금했습니다.
\`\`\`

예시2 입력:
\`\`\`
2. 「10 Things I Hate About You」(1999)
   "...But mostly, I hate the way I don't hate you... not even close"로 마무리되는 시입니다.
   이게 미국인의 사랑일까요?
\`\`\`
예시2 출력:
\`\`\`
**「10 Things I Hate About You」(1999)**

> "...But mostly, I hate the way I don't hate you... not even close"

로 마무리되는 시입니다. 이게 미국인의 사랑일까요?
\`\`\`

예시3 (제외 케이스): "1. 낭만   은 한국인들이니까 따로 설명은 생략하겠습니다" → 추출 제외 (단어 정의 목록)

예시4 (소제목 + 본문 + sub-question 리스트):
입력:
\`\`\`
1. **당신의 평범한 하루를 설명해 주세요.**

이 소설은 특별한 사건이 아닌, 수용소에서의 아주 평범한 하루를 그리고 있습니다.
하지만 그 하루를 따라가다 보면 당시 사회와 인간의 삶이 고스란히 드러납니다.

- 여러분의 평범한 하루는 어떤 모습인가요?
- 하루 중 가장 기다려지는 순간은 언제인가요?
- 이반의 하루와 비교했을 때 우리는 어떤 것들을 너무 당연하게 여기며 살아가고 있을까요?
\`\`\`
출력 (questions 배열의 한 항목 — 빈 줄 구분 + 리스트 보존):
\`\`\`
**당신의 평범한 하루를 설명해 주세요.**

이 소설은 특별한 사건이 아닌, 수용소에서의 아주 평범한 하루를 그리고 있습니다. 하지만 그 하루를 따라가다 보면 당시 사회와 인간의 삶이 고스란히 드러납니다.

- 여러분의 평범한 하루는 어떤 모습인가요?
- 하루 중 가장 기다려지는 순간은 언제인가요?
- 이반의 하루와 비교했을 때 우리는 어떤 것들을 너무 당연하게 여기며 살아가고 있을까요?
\`\`\`

예시5 (페이지 출처 보존 + 원본 순서 유지):
입력:
\`\`\`
3. 작중 등장하는 조각의 별명은 [손톱]이었습니다. (p.45)
   "언젠가부터 그녀를 의뢰인에게 보낼 적에..." (p.45)
   여러분이 킬러라면 어떤 별명을 갖고 싶나요?
\`\`\`
출력 (questions 배열의 한 항목 — **원본 순서 그대로 + p.45 보존**):
\`\`\`
작중 등장하는 조각의 별명은 [손톱]이었습니다. (p.45)

> "언젠가부터 그녀를 의뢰인에게 보낼 적에..." (p.45)

여러분이 킬러라면 어떤 별명을 갖고 싶나요?
\`\`\`

[순서]
PDF에 나온 순서대로 questions 배열에 담아주세요. 각 항목 안에서도 PDF 원본 순서를 그대로 유지하세요.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { text: prompt },
        { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
      ],
      config: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            questions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['questions'],
        },
      },
    });

    const text = response.text;
    if (!text) return { ok: false, error: 'AI 응답이 비어있습니다.' };

    let parsed: { questions?: string[] };
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: 'AI 응답을 해석하지 못했습니다.' };
    }
    const questions = (Array.isArray(parsed.questions) ? parsed.questions : [])
      .filter((q): q is string => typeof q === 'string')
      .map((q) => normalizeExtractedQuestion(q.trim()))
      .filter((q) => q.length > 0);

    if (questions.length === 0) {
      return { ok: false, error: '번호가 매겨진 질문을 찾지 못했습니다.' };
    }
    return { ok: true, questions };
  } catch (e) {
    console.error('[extractQuestionsFromPdf]', e);
    Sentry.captureException(e, { tags: { action: 'extractQuestionsFromPdf' } });
    if (e instanceof Error && e.name === 'AbortError') {
      return { ok: false, error: 'PDF 분석이 시간 초과되었습니다.' };
    }
    // Gemini returns 503 UNAVAILABLE when the model is overloaded; tell the user it's transient.
    if (e instanceof Error && e.message.includes('"code":503')) {
      return { ok: false, error: 'AI 서비스가 잠시 과부하 상태입니다. 1~2분 후 다시 시도해주세요.' };
    }
    return { ok: false, error: '발제문 추출에 실패했습니다.' };
  }
}

export async function addQuestionsInBulk(meetingId: string, contents: string[]) {
  const auth = await assertHost(meetingId);
  if (!auth.ok) return { ok: false as const, error: auth.error };
  const supabase = auth.supabase;

  const cleaned = contents.map((c) => c.trim()).filter((c) => c.length > 0);
  if (cleaned.length === 0) return { ok: false as const, error: '저장할 질문이 없습니다.' };

  const { data: existing } = await supabase
    .from('discussion_questions')
    .select('order_idx')
    .eq('meeting_id', meetingId)
    .order('order_idx', { ascending: false })
    .limit(1)
    .maybeSingle();

  const startIdx = (existing?.order_idx ?? -1) + 1;
  const rows = cleaned.map((content, i) => ({
    meeting_id: meetingId,
    order_idx: startIdx + i,
    content,
  }));

  const { error } = await supabase.from('discussion_questions').insert(rows);
  if (error) return { ok: false as const, error: error.message };
  await revalidateMeetingPaths(meetingId);
  return { ok: true as const };
}
