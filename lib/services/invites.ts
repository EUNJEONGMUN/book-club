
import { revalidatePath } from 'next/cache';
import * as Sentry from '@sentry/nextjs';
import { getSupabaseServer } from '@/lib/supabase/server';
import type { Invite } from '@/lib/types';

export async function rotateInvite(): Promise<
  { ok: true; invite: Pick<Invite, 'token' | 'expires_at'> } | { ok: false; error: string }
> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.rpc('rotate_invite');

  if (error) {
    console.error('[rotateInvite]', error);
    Sentry.captureException(error, { tags: { action: 'rotateInvite' } });
    if (error.message?.includes('Not authenticated')) {
      return { ok: false, error: '로그인이 필요합니다.' };
    }
    if (error.message?.includes('Not admin')) {
      return { ok: false, error: '모임 관리자만 초대링크를 발급할 수 있어요.' };
    }
    return { ok: false, error: '초대링크 발급에 실패했습니다.' };
  }
  if (!data) {
    return { ok: false, error: '초대링크 발급에 실패했습니다.' };
  }

  revalidatePath('/more/info');
  const { data: invite, error: lookupError } = await supabase
    .from('invites')
    .select('token, expires_at')
    .eq('token', data)
    .single();
  if (lookupError) {
    Sentry.captureException(lookupError, { tags: { action: 'rotateInviteLookup' } });
    return { ok: false, error: '링크는 발급됐지만 만료 시각을 확인하지 못했습니다. 새로고침해 확인해주세요.' };
  }

  return { ok: true, invite };
}
