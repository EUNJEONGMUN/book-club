'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function approveUser(userId: string) {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: '로그인이 필요합니다' };

  const { data: me } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (!me?.is_admin) return { ok: false as const, error: '관리자 권한이 필요합니다' };

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from('profiles')
    .update({ approved: true })
    .eq('id', userId);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath('/more');
  return { ok: true as const };
}
