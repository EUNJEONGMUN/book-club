import { getSupabaseServer } from '@/lib/supabase/server';
import type { Club, Meeting, Profile, Attendance } from '@/lib/types';

export type MyClub = Club & {
  role: 'admin' | 'member';
};

/** Returns clubs where the current user is an active member (admin or member). pending excluded. */
export async function getMyClubs(): Promise<MyClub[]> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('club_members')
    .select('role, club:clubs(*)')
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
