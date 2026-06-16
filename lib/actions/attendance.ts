'use server';

import { getSupabaseServer } from '@/lib/supabase/server';
import { revalidateMeetingPaths } from './_revalidate-meeting';
import type { AttendanceStatus } from '@/lib/types';

const VALID: AttendanceStatus[] = ['attending', 'not_attending', 'undecided'];

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * 참석 상태 설정. caller가 본인(target=caller)이거나 모임 host/클럽 admin인 경우만 허용.
 * - 본인 + 미래 모임 → 항상 OK
 * - 본인 + 지난 모임 → host/admin이 아닌 한 거절 ("기록 보존")
 * - 타인 → host/admin만 OK (정정 권한)
 */
export async function setAttendanceFor(
  meetingId: string,
  targetUserId: string,
  status: AttendanceStatus
): Promise<ActionResult> {
  if (!VALID.includes(status)) return { ok: false, error: '잘못된 상태값' };

  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요합니다' };

  const { data: meeting } = await supabase
    .from('meetings')
    .select('scheduled_at, host_id, club_id')
    .eq('id', meetingId)
    .maybeSingle();
  if (!meeting) return { ok: false, error: '모임을 찾을 수 없습니다.' };

  const isHost = meeting.host_id === user.id;
  const isPast = new Date(meeting.scheduled_at) <= new Date();
  const isSelf = targetUserId === user.id;

  // 권한 가드
  if (!isSelf && !isHost) {
    // 타인 거 변경 — host 아니면 admin인지 확인
    const { data: m } = await supabase
      .from('club_members')
      .select('role')
      .eq('club_id', meeting.club_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (m?.role !== 'admin') {
      return { ok: false, error: '본인 외 참석은 호스트나 관리자만 수정할 수 있어요.' };
    }
  }
  if (isSelf && isPast && !isHost) {
    // 본인 거지만 지난 모임 — host 아니면 admin인지 확인
    const { data: m } = await supabase
      .from('club_members')
      .select('role')
      .eq('club_id', meeting.club_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (m?.role !== 'admin') {
      return {
        ok: false,
        error: '지난 모임의 참석 여부는 호스트나 관리자만 수정할 수 있어요.',
      };
    }
  }

  const { error } = await supabase
    .from('attendances')
    .upsert(
      { meeting_id: meetingId, user_id: targetUserId, status },
      { onConflict: 'meeting_id,user_id' }
    );

  if (error) return { ok: false, error: error.message };
  await revalidateMeetingPaths(meetingId);
  return { ok: true };
}

/**
 * @deprecated setAttendanceFor(meetingId, callerId, status)를 사용하세요.
 * 기존 호출처 호환용 — 본인 호출만 처리.
 */
export async function setAttendance(meetingId: string, status: AttendanceStatus): Promise<ActionResult> {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요합니다' };
  return setAttendanceFor(meetingId, user.id, status);
}

/**
 * 참석 기록 완전 삭제. host/admin 전용 (지난 모임 정정용).
 */
export async function deleteAttendance(
  meetingId: string,
  targetUserId: string
): Promise<ActionResult> {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요합니다' };

  const { data: meeting } = await supabase
    .from('meetings')
    .select('host_id, club_id')
    .eq('id', meetingId)
    .maybeSingle();
  if (!meeting) return { ok: false, error: '모임을 찾을 수 없습니다.' };

  const isHost = meeting.host_id === user.id;
  if (!isHost) {
    const { data: m } = await supabase
      .from('club_members')
      .select('role')
      .eq('club_id', meeting.club_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (m?.role !== 'admin') {
      return { ok: false, error: '참석 기록 삭제는 호스트나 관리자만 할 수 있어요.' };
    }
  }

  const { data, error } = await supabase
    .from('attendances')
    .delete()
    .eq('meeting_id', meetingId)
    .eq('user_id', targetUserId)
    .select('user_id');

  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: '권한이 없거나 이미 처리된 기록입니다.' };
  }
  await revalidateMeetingPaths(meetingId);
  return { ok: true };
}
