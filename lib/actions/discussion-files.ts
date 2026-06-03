'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function uploadDiscussionFile(meetingId: string, formData: FormData) {
  const file = formData.get('file') as File | null;
  if (!file) return { ok: false as const, error: '파일이 없습니다.' };

  const maxSize = 20 * 1024 * 1024;
  if (file.size > maxSize) return { ok: false as const, error: '파일 크기는 20MB 이하여야 합니다.' };

  const ext = file.name.split('.').pop()?.toLowerCase();
  const safeName = file.name.replace(/[^a-zA-Z0-9._\-]/g, '_');
  const path = `${meetingId}/${safeName}`;

  const supabase = await getSupabaseServer();
  const { error } = await supabase.storage
    .from('discussion-files')
    .upload(path, file, { upsert: true });
  if (error) return { ok: false as const, error: error.message };

  const { data: { publicUrl } } = supabase.storage
    .from('discussion-files')
    .getPublicUrl(path);

  const { error: updateError } = await supabase
    .from('meetings')
    .update({ discussion_file_url: publicUrl })
    .eq('id', meetingId);
  if (updateError) return { ok: false as const, error: updateError.message };

  revalidatePath(`/meetings/${meetingId}`);
  return { ok: true as const, url: publicUrl, fileName: file.name, isPdf: ext === 'pdf' };
}

export async function removeDiscussionFile(meetingId: string) {
  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from('meetings')
    .update({ discussion_file_url: null })
    .eq('id', meetingId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/meetings/${meetingId}`);
  return { ok: true as const };
}

export async function extractQuestionsFromPdf(pdfUrl: string): Promise<
  { ok: true; questions: string[] } | { ok: false; error: string }
> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, error: 'Gemini API 키가 설정되지 않았습니다.' };

  try {
    const res = await fetch(pdfUrl);
    if (!res.ok) return { ok: false, error: 'PDF를 가져오지 못했습니다.' };
    const pdfBase64 = Buffer.from(await res.arrayBuffer()).toString('base64');

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
- 페이지 번호, 머리말/꼬리말

[항목 본문 구성 — 추출하기로 한 항목에 대해]
- 첫 줄에 소제목이 있으면 (예: "알레프 _ 창문", "「10 Things I Hate About You」(1999)") 마크다운 굵게 \`**소제목**\` 로 첫 줄에 배치
- 큰따옴표("..."), 일본식 괄호(「...」), 시 인용 등 인용문은 마크다운 인용구(\`> 인용내용\`)로 변환하여 별도 줄에 배치
- 번호 마커("1.", "α." 등) 자체는 결과 문자열에서 제거 (UI에서 자동 번호 매김)
- 본문 줄바꿈은 보존

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

[순서]
PDF에 나온 순서대로 questions 배열에 담아주세요.`;

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

    const parsed = JSON.parse(text) as { questions: string[] };
    const questions = (parsed.questions ?? [])
      .map((q) => q.trim())
      .filter((q) => q.length > 0);

    if (questions.length === 0) {
      return { ok: false, error: '번호가 매겨진 질문을 찾지 못했습니다.' };
    }
    return { ok: true, questions };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `발제문 추출 실패: ${msg}` };
  }
}

export async function addQuestionsInBulk(meetingId: string, contents: string[]) {
  const supabase = await getSupabaseServer();

  const { data: existing } = await supabase
    .from('discussion_questions')
    .select('order_idx')
    .eq('meeting_id', meetingId)
    .order('order_idx', { ascending: false })
    .limit(1)
    .maybeSingle();

  const startIdx = (existing?.order_idx ?? -1) + 1;
  const rows = contents.map((content, i) => ({
    meeting_id: meetingId,
    order_idx: startIdx + i,
    content,
  }));

  const { error } = await supabase.from('discussion_questions').insert(rows);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/meetings/${meetingId}`);
  return { ok: true as const };
}
