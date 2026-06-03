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
  const path = `${meetingId}/${Date.now()}.${ext}`;

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
  return { ok: true as const, url: publicUrl, isPdf: ext === 'pdf' };
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
  try {
    const res = await fetch(pdfUrl);
    if (!res.ok) return { ok: false, error: 'PDF를 가져오지 못했습니다.' };

    const buffer = Buffer.from(await res.arrayBuffer());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfModule = await import('pdf-parse') as any;
    const pdfParse = pdfModule.default ?? pdfModule;
    const data = await pdfParse(buffer);

    const lines = data.text
      .split('\n')
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0);

    // 번호로 시작하는 줄을 질문 후보로 추출 (1. / 1) / Q1. / • 등)
    const numbered = lines.filter((l: string) =>
      /^(\d+[.)]\s|Q\d+[.)]\s|•\s|-\s)/.test(l)
    );

    const questions = (numbered.length > 0 ? numbered : lines)
      .map((l: string) => l.replace(/^(\d+[.)]\s*|Q\d+[.)]\s*|•\s*|-\s*)/, '').trim())
      .filter((l: string) => l.length > 5)
      .slice(0, 20);

    if (questions.length === 0) return { ok: false, error: '질문을 추출하지 못했습니다. PDF 내용을 확인해주세요.' };
    return { ok: true, questions };
  } catch {
    return { ok: false, error: 'PDF 파싱 중 오류가 발생했습니다.' };
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
