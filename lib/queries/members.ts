import { getMembership } from '@/lib/auth/membership';
import { getSupabaseServer } from '@/lib/supabase/server';

export async function getCurrentProfile() {
  const membership = await getMembership();
  if (!membership) return null;
  const supabase = await getSupabaseServer();
  const { data } = await supabase.from('profiles').select('*').eq('id', membership.user.id).maybeSingle();
  return data;
}
