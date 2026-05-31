'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServer } from '@/lib/supabase/server';
import { questionFormSchema } from '@/lib/validation/question';

export async function addQuestion(meetingId: string, input: unknown) {
  const parsed = questionFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };

  const supabase = await getSupabaseServer();
  const { data: existing } = await supabase
    .from('discussion_questions')
    .select('order_idx')
    .eq('meeting_id', meetingId)
    .order('order_idx', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextIdx = (existing?.order_idx ?? -1) + 1;

  const { error } = await supabase.from('discussion_questions').insert({
    meeting_id: meetingId,
    order_idx: nextIdx,
    content: parsed.data.content,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/meetings/${meetingId}`);
  return { ok: true as const };
}

export async function updateQuestion(id: string, meetingId: string, input: unknown) {
  const parsed = questionFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from('discussion_questions')
    .update({ content: parsed.data.content })
    .eq('id', id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/meetings/${meetingId}`);
  return { ok: true as const };
}

export async function deleteQuestion(id: string, meetingId: string) {
  const supabase = await getSupabaseServer();
  const { error } = await supabase.from('discussion_questions').delete().eq('id', id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/meetings/${meetingId}`);
  return { ok: true as const };
}

export async function reorderQuestion(id: string, meetingId: string, newOrderIdx: number) {
  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from('discussion_questions')
    .update({ order_idx: newOrderIdx })
    .eq('id', id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/meetings/${meetingId}`);
  return { ok: true as const };
}
