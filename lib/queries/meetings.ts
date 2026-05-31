import { getSupabaseServer } from '@/lib/supabase/server';
import type { Meeting, Profile, DiscussionQuestion, Attendance } from '@/lib/types';

export async function getNextMeeting(): Promise<(Meeting & { host: Profile; questions_count: number }) | null> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('meetings')
    .select('*, host:profiles!meetings_host_id_fkey(*), discussion_questions(count)')
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  // discussion_questions is returned as [{ count: N }] — extract
  const questions_count = (data as any).discussion_questions?.[0]?.count ?? 0;
  return { ...(data as any), questions_count } as Meeting & { host: Profile; questions_count: number };
}

export async function getUpcomingMeetings(): Promise<Array<Meeting & { host: Profile }>> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('meetings')
    .select('*, host:profiles!meetings_host_id_fkey(*)')
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Array<Meeting & { host: Profile }>;
}

export async function getPastMeetings(): Promise<Array<Meeting & { host: Profile }>> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('meetings')
    .select('*, host:profiles!meetings_host_id_fkey(*)')
    .lt('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Array<Meeting & { host: Profile }>;
}

export type MeetingDetail = Meeting & {
  host: Profile;
  questions: DiscussionQuestion[];
  attendances: Array<Attendance & { profile: Profile }>;
};

export async function getMeetingDetail(id: string): Promise<MeetingDetail | null> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('meetings')
    .select(`
      *,
      host:profiles!meetings_host_id_fkey(*),
      questions:discussion_questions(*),
      attendances(*, profile:profiles(*))
    `)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const detail = data as unknown as MeetingDetail;
  detail.questions.sort((a, b) => a.order_idx - b.order_idx);
  return detail;
}

export async function getMyAttendance(meetingId: string, userId: string) {
  const supabase = await getSupabaseServer();
  const { data } = await supabase
    .from('attendances')
    .select('status')
    .eq('meeting_id', meetingId)
    .eq('user_id', userId)
    .maybeSingle();
  return data?.status ?? null;
}
