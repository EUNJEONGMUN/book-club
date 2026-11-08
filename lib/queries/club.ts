import { getSupabaseServer } from '@/lib/supabase/server';
import type { ClubSettings, Invite, Meeting, Profile, Attendance } from '@/lib/types';

export async function getClubSettings(): Promise<ClubSettings | null> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.from('club_settings').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  return data;
}

export type NextMeetingWithAttendance = Meeting & {
  host: Profile;
  questions_count: number;
  attendances: Array<Attendance & { profile: Profile }>;
};

export async function getNextMeeting(): Promise<NextMeetingWithAttendance | null> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('meetings')
    .select('*, host:profiles!meetings_host_id_fkey(*), discussion_questions(count), attendances(*, profile:profiles(*))')
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const questions_count = (data as any).discussion_questions?.[0]?.count ?? 0;
  return { ...(data as any), questions_count } as NextMeetingWithAttendance;
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

/** Returns the currently active invite for the club, or null. RLS restricts this to administrators. */
export async function getActiveInvite(): Promise<Invite | null> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('invites')
    .select('*')
    .is('revoked_at', null)
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type PendingApplicant = {
  user_id: string;
  display_name: string;
  joined_at: string; // application time
};

/** Returns pending applicants for the club. RLS restricts to active members. */
export async function getPendingApplicants(): Promise<PendingApplicant[]> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('members')
    .select('user_id, joined_at, profile:profiles(display_name)')
    .eq('role', 'pending')
    .order('joined_at', { ascending: true });
  if (error) throw error;
  return (data ?? [])
    .filter((row: any) => row.profile != null)
    .map((row: any) => ({
      user_id: row.user_id,
      display_name: row.profile.display_name,
      joined_at: row.joined_at,
    }));
}

export type ActiveMember = {
  user_id: string;
  display_name: string;
  role: 'admin' | 'member';
  joined_at: string;
};

/** Returns admin + member rows for the club. Pending excluded. RLS restricts to active members. */
export async function getActiveMembers(): Promise<ActiveMember[]> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('members')
    .select('user_id, role, joined_at, profile:profiles(display_name)')
    .in('role', ['admin', 'member'])
    .order('joined_at', { ascending: true });
  if (error) throw error;
  return (data ?? [])
    .filter((row: any) => row.profile != null)
    .map((row: any) => ({
      user_id: row.user_id,
      display_name: row.profile.display_name,
      role: row.role as 'admin' | 'member',
      joined_at: row.joined_at,
    }));
}

export type MemberWithStats = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  role: 'admin' | 'member';
  attended_count: number;
  hosted_count: number;
};

/**
 * Returns active members (admin + member) of the service with per-member
 * attended + hosted counts for the service. Pending excluded.
 * RLS restricts to active members — non-members get [].
 */
export async function getMembersWithStats(): Promise<MemberWithStats[]> {
  const supabase = await getSupabaseServer();

  const { data: memberRows, error: memberErr } = await supabase
    .from('members')
    .select('user_id, role, profile:profiles(display_name, avatar_url)')
    .in('role', ['admin', 'member']);
  if (memberErr) throw memberErr;
  const members = (memberRows ?? []).filter((r: any) => r.profile != null);

  if (members.length === 0) return [];

  const { data: meetings, error: meetingsErr } = await supabase
    .from('meetings')
    .select('id, host_id');
  if (meetingsErr) throw meetingsErr;
  const meetingIds = (meetings ?? []).map((m) => m.id);

  let attendances: Array<{ user_id: string }> = [];
  if (meetingIds.length > 0) {
    const { data, error: attErr } = await supabase
      .from('attendances')
      .select('user_id')
      .in('meeting_id', meetingIds)
      .eq('status', 'attending');
    if (attErr) throw attErr;
    attendances = data ?? [];
  }

  const attendedMap = new Map<string, number>();
  attendances.forEach((a) => attendedMap.set(a.user_id, (attendedMap.get(a.user_id) ?? 0) + 1));
  const hostedMap = new Map<string, number>();
  (meetings ?? []).forEach((m) => hostedMap.set(m.host_id, (hostedMap.get(m.host_id) ?? 0) + 1));

  return members
    .map((row: any) => ({
      user_id: row.user_id,
      display_name: row.profile.display_name,
      avatar_url: row.profile.avatar_url ?? null,
      role: row.role as 'admin' | 'member',
      attended_count: attendedMap.get(row.user_id) ?? 0,
      hosted_count: hostedMap.get(row.user_id) ?? 0,
    }))
    .sort((a, b) => a.display_name.localeCompare(b.display_name, 'ko'));
}

export type MemberHistoryItem = {
  meeting_id: string;
  book_title: string;
  book_cover_url: string | null;
  scheduled_at: string;
  is_host: boolean;
};

/**
 * Returns meeting history for one member within the service.
 * Items where the member was host take precedence over attendance-only.
 * Sorted by scheduled_at desc.
 * RLS restricts to active members — non-members get [].
 */
export async function getMemberHistory(userId: string): Promise<MemberHistoryItem[]> {
  const supabase = await getSupabaseServer();

  const [{ data: hosted }, { data: attended }] = await Promise.all([
    supabase
      .from('meetings')
      .select('id, book_title, book_cover_url, scheduled_at')
      .eq('host_id', userId),
    supabase
      .from('attendances')
      .select('meeting_id, meeting:meetings!inner(book_title, book_cover_url, scheduled_at)')
      .eq('user_id', userId)
      .eq('status', 'attending'),
  ]);

  const map = new Map<string, MemberHistoryItem>();

  (hosted ?? []).forEach((m) => {
    map.set(m.id, {
      meeting_id: m.id,
      book_title: m.book_title,
      book_cover_url: m.book_cover_url ?? null,
      scheduled_at: m.scheduled_at,
      is_host: true,
    });
  });

  (attended ?? []).forEach((a: any) => {
    if (map.has(a.meeting_id)) return; // 발제 우선 보존
    const m = a.meeting as { book_title: string; book_cover_url: string | null; scheduled_at: string } | null;
    if (!m) return;
    map.set(a.meeting_id, {
      meeting_id: a.meeting_id,
      book_title: m.book_title,
      book_cover_url: m.book_cover_url ?? null,
      scheduled_at: m.scheduled_at,
      is_host: false,
    });
  });

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()
  );
}

