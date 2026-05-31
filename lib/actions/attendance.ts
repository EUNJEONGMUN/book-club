'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServer } from '@/lib/supabase/server';
import type { AttendanceStatus } from '@/lib/types';

const VALID: AttendanceStatus[] = ['attending', 'not_attending', 'undecided'];

export async function setAttendance(meetingId: string, status: AttendanceStatus) {
  if (!VALID.includes(status)) return { ok: false as const, error: '잘못된 상태값' };
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: '로그인이 필요합니다' };

  const { error } = await supabase
    .from('attendances')
    .upsert({ meeting_id: meetingId, user_id: user.id, status }, { onConflict: 'meeting_id,user_id' });

  if (error) return { ok: false as const, error: error.message };
  revalidatePath('/');
  revalidatePath(`/meetings/${meetingId}`);
  return { ok: true as const };
}
