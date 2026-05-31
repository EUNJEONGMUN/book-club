import { getSupabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { Invite } from '@/lib/types';

export async function getMyInvites(): Promise<Invite[]> {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('invites')
    .select('*')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// service role: 토큰으로 invite 조회 (가입 페이지에서 사용)
export async function getInviteByToken(token: string): Promise<Invite | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from('invites').select('*').eq('token', token).maybeSingle();
  return data;
}
