import { getSupabaseServer } from '@/lib/supabase/server';
import type { Club, ClubInvite, Meeting, Profile, Attendance } from '@/lib/types';

export type MyClub = Club & {
  role: 'admin' | 'member';
};

/** Returns clubs where the current user is an active member (admin or member). pending excluded. */
export async function getMyClubs(): Promise<MyClub[]> {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('club_members')
    .select('role, club:clubs(*)')
    .eq('user_id', user.id)
    .in('role', ['admin', 'member'])
    .order('joined_at', { ascending: true });
  if (error) throw error;
  return (data ?? [])
    .filter((row: any) => row.club !== null)
    .map((row: any) => ({ ...row.club, role: row.role })) as MyClub[];
}

/** Returns the club if the current user is an active member; null otherwise. RLS enforces. */
export async function getClubById(id: string): Promise<Club | null> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('clubs')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type NextMeetingInClub = Meeting & {
  host: Profile;
  questions_count: number;
  attendances: Array<Attendance & { profile: Profile }>;
};

export async function getNextMeetingInClub(clubId: string): Promise<NextMeetingInClub | null> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('meetings')
    .select('*, host:profiles!meetings_host_id_fkey(*), discussion_questions(count), attendances(*, profile:profiles(*))')
    .eq('club_id', clubId)
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const questions_count = (data as any).discussion_questions?.[0]?.count ?? 0;
  return { ...(data as any), questions_count } as NextMeetingInClub;
}

export async function getUpcomingMeetingsInClub(clubId: string): Promise<Array<Meeting & { host: Profile }>> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('meetings')
    .select('*, host:profiles!meetings_host_id_fkey(*)')
    .eq('club_id', clubId)
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Array<Meeting & { host: Profile }>;
}

export async function getPastMeetingsInClub(clubId: string): Promise<Array<Meeting & { host: Profile }>> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('meetings')
    .select('*, host:profiles!meetings_host_id_fkey(*)')
    .eq('club_id', clubId)
    .lt('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Array<Meeting & { host: Profile }>;
}

/** Returns the currently active invite for the club, or null. RLS restricts this to club admins. */
export async function getActiveInvite(clubId: string): Promise<ClubInvite | null> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('club_invites')
    .select('*')
    .eq('club_id', clubId)
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
  joined_at: string; // application time (joined_at in club_members)
};

/** Returns pending applicants for the club. RLS restricts to active members of the club. */
export async function getPendingApplicants(clubId: string): Promise<PendingApplicant[]> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('club_members')
    .select('user_id, joined_at, profile:profiles(display_name)')
    .eq('club_id', clubId)
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

export type ClubActiveMember = {
  user_id: string;
  display_name: string;
  role: 'admin' | 'member';
  joined_at: string;
};

/** Returns admin + member rows for the club. Pending excluded. RLS restricts to active members of the club. */
export async function getClubActiveMembers(clubId: string): Promise<ClubActiveMember[]> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('club_members')
    .select('user_id, role, joined_at, profile:profiles(display_name)')
    .eq('club_id', clubId)
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

export type ClubMemberWithStats = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  role: 'admin' | 'member';
  attended_count: number;
  hosted_count: number;
};

/**
 * Returns active members (admin + member) of the club with per-member
 * attended + hosted counts scoped to this club. Pending excluded.
 * RLS restricts to active members of the club — non-members get [].
 */
export async function getClubMembersWithStats(clubId: string): Promise<ClubMemberWithStats[]> {
  const supabase = await getSupabaseServer();

  const { data: memberRows, error: memberErr } = await supabase
    .from('club_members')
    .select('user_id, role, profile:profiles(display_name, avatar_url)')
    .eq('club_id', clubId)
    .in('role', ['admin', 'member']);
  if (memberErr) throw memberErr;
  const members = (memberRows ?? []).filter((r: any) => r.profile != null);

  if (members.length === 0) return [];

  const { data: meetings, error: meetingsErr } = await supabase
    .from('meetings')
    .select('id, host_id')
    .eq('club_id', clubId);
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
