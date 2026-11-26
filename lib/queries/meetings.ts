import { getSupabaseServer } from '@/lib/supabase/server';
import type { Meeting, Profile, DiscussionQuestion, Attendance } from '@/lib/types';

const MEETING_WITH_HOST = '*, host:profiles!meetings_host_id_fkey(*)' as const;

export type MeetingDetail = Meeting & {
  host: Profile;
  questions: DiscussionQuestion[];
  attendances: Array<Attendance & { profile: Profile }>;
};

export type NextMeetingWithAttendance = Meeting & {
  host: Profile;
  questions_count: number;
  attendances: Array<Attendance & { profile: Profile }>;
};

export async function getNextMeeting(): Promise<NextMeetingWithAttendance | null> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('meetings')
    .select(`${MEETING_WITH_HOST}, discussion_questions(count), attendances(*, profile:profiles(*))`)
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const questions_count = (data as any).discussion_questions?.[0]?.count ?? 0;
  return { ...(data as any), questions_count } as NextMeetingWithAttendance;
}

export async function getUpcomingMeetings(now: Date): Promise<Array<Meeting & { host: Profile }>> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('meetings')
    .select(MEETING_WITH_HOST)
    .gte('scheduled_at', now.toISOString())
    .order('scheduled_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Array<Meeting & { host: Profile }>;
}

export async function getFirstPastMeetingDate(now: Date): Promise<string | null> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('meetings')
    .select('scheduled_at')
    .lt('scheduled_at', now.toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.scheduled_at ?? null;
}

export async function getPastMeetings(year: number, now: Date): Promise<Array<Meeting & { host: Profile }>> {
  const start = new Date(`${year}-01-01T00:00:00+09:00`);
  const nextYear = new Date(`${year + 1}-01-01T00:00:00+09:00`);
  const end = now < nextYear ? now : nextYear;
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('meetings')
    .select(MEETING_WITH_HOST)
    .gte('scheduled_at', start.toISOString())
    .lt('scheduled_at', end.toISOString())
    .order('scheduled_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Array<Meeting & { host: Profile }>;
}

export async function getMeetingDetail(id: string): Promise<MeetingDetail | null> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('meetings')
    .select(`${MEETING_WITH_HOST}, questions:discussion_questions(*), attendances(*, profile:profiles(*))`)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const detail = data as unknown as MeetingDetail;
  detail.questions.sort((a, b) => a.order_idx - b.order_idx);
  return detail;
}

export async function getHostedMeetings(userId: string): Promise<Array<Meeting & { host: Profile }>> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('meetings')
    .select(MEETING_WITH_HOST)
    .eq('host_id', userId)
    .order('scheduled_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Array<Meeting & { host: Profile }>;
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
