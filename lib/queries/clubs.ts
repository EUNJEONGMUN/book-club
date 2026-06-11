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
