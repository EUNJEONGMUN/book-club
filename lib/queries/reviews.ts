import { getSupabaseServer } from '@/lib/supabase/server';

export type MeetingReview = {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  content: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
};

export type MeetingReviewsBundle = {
  own: MeetingReview | null;
  others: MeetingReview[]; // 본인 제외, 공개만 (RLS가 자동 필터)
};

/**
 * 모임의 본인 평 + 다른 멤버 공개 평을 한 번에 조회.
 * RLS가 본인 거 OR (is_public AND 같은 클럽 멤버) 만 SELECT 허용.
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
      is_public,
      created_at,
      updated_at,
      profile:profiles(display_name, avatar_url)
    `)
    .eq('meeting_id', meetingId)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  const rows = (data ?? []).filter((r: any) => r.profile != null);

  const flat: MeetingReview[] = rows.map((r: any) => ({
    id: r.id,
    user_id: r.user_id,
    display_name: r.profile.display_name,
    avatar_url: r.profile.avatar_url ?? null,
    content: r.content,
    is_public: r.is_public,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));

  const own = user ? flat.find((r) => r.user_id === user.id) ?? null : null;
  const others = flat.filter((r) => r.user_id !== user?.id);
  return { own, others };
}
