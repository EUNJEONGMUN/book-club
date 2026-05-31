'use server';

import { revalidatePath } from 'next/cache';
import { randomBytes } from 'crypto';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

function generateToken(): string {
  return randomBytes(16).toString('hex');
}

export async function createInvite(): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요합니다' };

  const token = generateToken();
  const { error } = await supabase.from('invites').insert({ token, created_by: user.id });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/more/invite');
  return { ok: true, token };
}

export async function consumeInvite(token: string, newUserId: string) {
  const admin = getSupabaseAdmin();
  const { data: invite } = await admin.from('invites').select('*').eq('token', token).maybeSingle();
  if (!invite) return { ok: false as const, error: '잘못된 초대 링크' };
  if (invite.used_by) return { ok: false as const, error: '이미 사용된 초대 링크' };
  if (new Date(invite.expires_at) < new Date()) return { ok: false as const, error: '만료된 초대 링크' };

  const { error } = await admin
    .from('invites')
    .update({ used_by: newUserId, used_at: new Date().toISOString() })
    .eq('id', invite.id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}
