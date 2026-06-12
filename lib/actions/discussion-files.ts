'use server';

import * as Sentry from '@sentry/nextjs';
import { getSupabaseServer } from '@/lib/supabase/server';
import { revalidateMeetingPaths } from './_revalidate-meeting';

const STORAGE_BUCKET = 'discussion-files';
const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20MB

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
    .select('host_id')
    .eq('id', meetingId)
    .maybeSingle();
  if (error || !meeting) return { ok: false as const, error: '모임을 찾을 수 없습니다.', supabase: null };
  if (meeting.host_id !== user.id) return { ok: false as const, error: '발제자만 사용할 수 있습니다.', supabase: null };

  return { ok: true as const, supabase, user };
}

function publicUrlToPath(url: string): string | null {
  const marker = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const tail = url.slice(idx + marker.length);
  return tail.split('?')[0] || null;
}

export async function uploadDiscussionFile(meetingId: string, formData: FormData) {
  const auth = await assertHost(meetingId);
  if (!auth.ok) return { ok: false as const, error: auth.error };
  const supabase = auth.supabase;

  const file = formData.get('file') as File | null;
  if (!file) return { ok: false as const, error: '파일이 없습니다.' };

  if (file.size > MAX_PDF_BYTES) return { ok: false as const, error: '파일 크기는 20MB 이하여야 합니다.' };

  const ext = file.name.split('.').pop()?.toLowerCase();
  const safeName = file.name.replace(/[^a-zA-Z0-9._\-]/g, '_') || 'file';
  // Unique path prevents Korean-name collisions and CDN cache reuse
  const path = `${meetingId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { upsert: false });
  if (uploadError) return { ok: false as const, error: uploadError.message };

  const { data: { publicUrl } } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(path);

  // Clean up previous file (if any) to avoid orphans
  const { data: prev } = await supabase
    .from('meetings')
    .select('discussion_file_url')
    .eq('id', meetingId)
    .maybeSingle();
  const prevPath = prev?.discussion_file_url ? publicUrlToPath(prev.discussion_file_url) : null;
  if (prevPath && prevPath !== path) {
    await supabase.storage.from(STORAGE_BUCKET).remove([prevPath]);
  }

  const { error: updateError } = await supabase
    .from('meetings')
    .update({ discussion_file_url: publicUrl, discussion_file_name: file.name })
    .eq('id', meetingId);
  if (updateError) {
    // Roll back the new storage object on failed DB update
    await supabase.storage.from(STORAGE_BUCKET).remove([path]);
    return { ok: false as const, error: updateError.message };
  }

  await revalidateMeetingPaths(meetingId);
  return { ok: true as const, url: publicUrl, fileName: file.name, isPdf: ext === 'pdf' };
}

export async function removeDiscussionFile(meetingId: string) {
  const auth = await assertHost(meetingId);
  if (!auth.ok) return { ok: false as const, error: auth.error };
  const supabase = auth.supabase;

  const { data: row } = await supabase
    .from('meetings')
    .select('discussion_file_url')
    .eq('id', meetingId)
    .maybeSingle();
  const path = row?.discussion_file_url ? publicUrlToPath(row.discussion_file_url) : null;

  const { error } = await supabase
    .from('meetings')
    .update({ discussion_file_url: null, discussion_file_name: null })
    .eq('id', meetingId);
  if (error) return { ok: false as const, error: error.message };

  if (path) {
    await supabase.storage.from(STORAGE_BUCKET).remove([path]);
  }

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
    if (contentLength > MAX_PDF_BYTES) {
      return { ok: false, error: 'PDF가 너무 큽니다 (20MB 초과).' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000); // 60s timeout
    let pdfBase64: string;
    try {
      const res = await fetch(pdfUrl, { signal: controller.signal });
      if (!res.ok) return { ok: false, error: 'PDF를 가져오지 못했습니다.' };
      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_PDF_BYTES) {
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
