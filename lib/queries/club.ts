import { getSupabaseServer } from '@/lib/supabase/server';
import type { ClubSettings, Invite } from '@/lib/types';

export async function getClubSettings(): Promise<ClubSettings | null> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.from('club_settings').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  return data;
}

/** Returns the currently active invite for the club, or null. RLS restricts this to administrators. */
export async function getActiveInvite(): Promise<Invite | null> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('invites')
    .select('*')
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
