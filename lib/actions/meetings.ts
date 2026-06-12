'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { meetingFormSchema } from '@/lib/validation/meeting';

type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

export async function createMeeting(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = meetingFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요합니다' };

  const { data, error } = await supabase
    .from('meetings')
    .insert({
      club_id: parsed.data.club_id,
      host_id: user.id,
      book_title: parsed.data.book_title,
      book_author: parsed.data.book_author,
      book_cover_url: parsed.data.book_cover_url || null,
      scheduled_at: new Date(parsed.data.scheduled_at).toISOString(),
      location_name: parsed.data.location_name,
      location_url: parsed.data.location_url || null,
      location_address: parsed.data.location_address || null,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath('/');
  revalidatePath('/meetings');
  return { ok: true, data: { id: data.id } };
}

export async function updateMeeting(id: string, input: unknown): Promise<ActionResult> {
  const parsed = meetingFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('meetings')
    .update({
      book_title: parsed.data.book_title,
      book_author: parsed.data.book_author,
      book_cover_url: parsed.data.book_cover_url || null,
      scheduled_at: new Date(parsed.data.scheduled_at).toISOString(),
      location_name: parsed.data.location_name,
      location_url: parsed.data.location_url || null,
      location_address: parsed.data.location_address || null,
    })
    .eq('id', id)
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: '발제자만 모임을 수정할 수 있어요.' };
  }
  revalidatePath(`/meetings/${id}`);
  revalidatePath('/meetings');
  revalidatePath('/');
  return { ok: true };
}

export async function deleteMeeting(id: string): Promise<ActionResult> {
  const supabase = await getSupabaseServer();
  const { error } = await supabase.from('meetings').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/meetings');
  revalidatePath('/');
  redirect('/meetings');
}
