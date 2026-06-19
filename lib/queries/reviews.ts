import { getSupabaseServer } from '@/lib/supabase/server';
import type { ReviewVisibility } from '@/lib/validation/review';

export type MeetingReview = {
  id: string;
  /** 익명일 때 본인이 아니면 null로 마스킹 */
  user_id: string | null;
  display_name: string;
  avatar_url: string | null;
  content: string;
  visibility: ReviewVisibility;
  created_at: string;
  updated_at: string;
};

export type MeetingReviewsBundle = {
  own: MeetingReview | null;
  others: MeetingReview[]; // 본인 제외, public + anonymous (RLS가 자동 필터)
};

/**
 * 모임의 본인 평 + 다른 멤버의 visible(public/anonymous) 평 조회.
 * - RLS: 본인 거 OR (visibility IN public/anonymous AND 같은 클럽 멤버)
 * - 익명 평이면서 caller가 작성자가 아니면 server에서 user_id/display_name/avatar
 *   를 가려서 응답 (client는 진짜 user_id 알 수 없음).
 */
export async function getMeetingReviews(meetingId: string): Promise<MeetingReviewsBundle> {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('meeting_reviews')
    .select(`
      id,
      user_id,
      content,
      visibility,
      created_at,
      updated_at,
      profile:profiles(display_name, avatar_url)
    `)
    .eq('meeting_id', meetingId)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  const rows = (data ?? []).filter((r: any) => r.profile != null);

  const flat: MeetingReview[] = rows.map((r: any) => {
    const isOwn = user?.id === r.user_id;
    const isAnonHidden = r.visibility === 'anonymous' && !isOwn;
    return {
      id: r.id,
      user_id: isAnonHidden ? null : r.user_id,
      display_name: isAnonHidden ? '익명' : r.profile.display_name,
      avatar_url: isAnonHidden ? null : (r.profile.avatar_url ?? null),
      content: r.content,
      visibility: r.visibility,
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  });

  const own = user ? flat.find((r) => r.user_id === user.id) ?? null : null;
  const others = flat.filter((r) => !user || r.user_id !== user.id);
  return { own, others };
}
