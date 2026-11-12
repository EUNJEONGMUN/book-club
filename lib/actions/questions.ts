'use server';

import { getSupabaseServer } from '@/lib/supabase/server';
import { revalidateMeetingPaths } from './_revalidate-meeting';
import { questionFormSchema } from '@/lib/validation/question';

const QUESTION_NOT_CHANGED = '질문을 찾을 수 없거나 발제자 권한이 없습니다.';

export async function addQuestion(meetingId: string, input: unknown) {
  const parsed = questionFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  return appendQuestions(meetingId, [parsed.data.content]);
}

export async function addQuestionsInBulk(meetingId: string, contents: string[]) {
  const cleaned = contents.map((content) => content.trim()).filter(Boolean);
  if (cleaned.length === 0) return { ok: false as const, error: '저장할 질문이 없습니다.' };
  return appendQuestions(meetingId, cleaned);
}

async function appendQuestions(meetingId: string, contents: string[]) {
  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc('append_discussion_questions', {
    target_meeting_id: meetingId,
    question_contents: contents,
  });
  if (error?.code === '42501') {
    return { ok: false as const, error: '모임을 찾을 수 없거나 발제자 권한이 없습니다.' };
  }
  if (error) return { ok: false as const, error: error.message };
  await revalidateMeetingPaths(meetingId);
  return { ok: true as const };
}

export async function updateQuestion(id: string, meetingId: string, input: unknown) {
  const parsed = questionFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  const supabase = await getSupabaseServer();
  const { data: meeting } = await supabase.from('meetings').select('id').eq('id', meetingId).maybeSingle();
  if (!meeting) return { ok: false as const, error: '모임을 찾을 수 없습니다.' };
  const { data, error } = await supabase
    .from('discussion_questions')
    .update({ content: parsed.data.content })
    .eq('id', id).eq('meeting_id', meetingId)
    .select('id').maybeSingle();
  if (error) return { ok: false as const, error: error.message };
  if (!data) return { ok: false as const, error: QUESTION_NOT_CHANGED };
  await revalidateMeetingPaths(meetingId);
  return { ok: true as const };
}

export async function deleteQuestion(id: string, meetingId: string) {
  const supabase = await getSupabaseServer();
  const { data: meeting } = await supabase.from('meetings').select('id').eq('id', meetingId).maybeSingle();
  if (!meeting) return { ok: false as const, error: '모임을 찾을 수 없습니다.' };
  const { data, error } = await supabase
    .from('discussion_questions')
    .delete()
    .eq('id', id).eq('meeting_id', meetingId)
    .select('id').maybeSingle();
  if (error) return { ok: false as const, error: error.message };
  if (!data) return { ok: false as const, error: QUESTION_NOT_CHANGED };
  await revalidateMeetingPaths(meetingId);
  return { ok: true as const };
}

export async function reorderQuestion(id: string, meetingId: string, newOrderIdx: number) {
  const supabase = await getSupabaseServer();
  const { data: meeting } = await supabase.from('meetings').select('id').eq('id', meetingId).maybeSingle();
  if (!meeting) return { ok: false as const, error: '모임을 찾을 수 없습니다.' };
  const { data, error } = await supabase
    .from('discussion_questions')
    .update({ order_idx: newOrderIdx })
    .eq('id', id).eq('meeting_id', meetingId)
    .select('id').maybeSingle();
  if (error) return { ok: false as const, error: error.message };
  if (!data) return { ok: false as const, error: QUESTION_NOT_CHANGED };
  await revalidateMeetingPaths(meetingId);
  return { ok: true as const };
}
