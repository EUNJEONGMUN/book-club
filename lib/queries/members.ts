import { getSupabaseServer } from '@/lib/supabase/server';

export type MemberStats = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  attended_count: number;
  hosted_count: number;
};

export async function getAllMembersWithStats(): Promise<MemberStats[]> {
  const supabase = await getSupabaseServer();
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .order('display_name', { ascending: true });
  if (error) throw error;

  const [attended, hosted] = await Promise.all([
    supabase.from('attendances').select('user_id').eq('status', 'attending'),
    supabase.from('meetings').select('host_id'),
  ]);

  const attendedMap = new Map<string, number>();
  attended.data?.forEach((r) => attendedMap.set(r.user_id, (attendedMap.get(r.user_id) ?? 0) + 1));
  const hostedMap = new Map<string, number>();
  hosted.data?.forEach((r) => hostedMap.set(r.host_id, (hostedMap.get(r.host_id) ?? 0) + 1));

  return (profiles ?? []).map((p) => ({
    ...p,
    attended_count: attendedMap.get(p.id) ?? 0,
    hosted_count: hostedMap.get(p.id) ?? 0,
  }));
}

export async function getCurrentProfile() {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  return data;
}
