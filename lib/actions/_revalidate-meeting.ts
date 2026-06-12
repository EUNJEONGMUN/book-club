import { revalidatePath } from 'next/cache';
import { getSupabaseServer } from '@/lib/supabase/server';

/**
 * 클럽 스코프 모임 관련 경로 일괄 revalidate. meetingId로 club_id 1회 조회.
 * 모임이 없으면(이미 삭제, RLS 차단 등) no-op.
 *
 * 호출하는 자리는 모임 데이터를 막 바꾼 직후 — 모임 상세/홈/모임 리스트
 * 캐시를 깨야 stale 데이터가 화면에 안 남음.
 */
export async function revalidateMeetingPaths(meetingId: string): Promise<void> {
  const supabase = await getSupabaseServer();
  const { data } = await supabase
    .from('meetings')
    .select('club_id')
    .eq('id', meetingId)
    .maybeSingle();
  if (!data?.club_id) return;
  revalidatePath(`/clubs/${data.club_id}/meetings/${meetingId}`);
  revalidatePath(`/clubs/${data.club_id}/meetings`);
  revalidatePath(`/clubs/${data.club_id}`);
}
