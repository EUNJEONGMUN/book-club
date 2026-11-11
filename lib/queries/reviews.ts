import type { Database } from '@/lib/database.types';
import { getSupabaseServer } from '@/lib/supabase/server';

export type MeetingReview = Database['public']['Functions']['get_meeting_reviews']['Returns'][number];

export type MeetingReviewsBundle = {
  own: MeetingReview | null;
  others: MeetingReview[];
};

export async function getMeetingReviews(meetingId: string): Promise<MeetingReviewsBundle> {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .rpc('get_meeting_reviews', { target_meeting_id: meetingId })
    .order('updated_at', { ascending: false });

  if (error) throw error;
  const reviews = data ?? [];
  return {
    own: reviews.find((review) => review.user_id === user?.id) ?? null,
    others: reviews.filter((review) => review.user_id !== user?.id),
  };
}
