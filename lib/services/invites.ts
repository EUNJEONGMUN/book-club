
import { revalidatePath } from 'next/cache';
import * as Sentry from '@sentry/nextjs';
import { getSupabaseServer } from '@/lib/supabase/server';

export async function rotateInvite(): Promise<
  { ok: true; invite: { token: string } } | { ok: false; error: string }
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
  return { ok: true, invite: { token: data } };
}

export async function revokeInvite(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc('revoke_invite');

  if (error) {
    console.error('[revokeInvite]', error);
    Sentry.captureException(error, { tags: { action: 'revokeInvite' } });
    if (error.message?.includes('Not authenticated')) {
      return { ok: false, error: '로그인이 필요합니다.' };
    }
    if (error.message?.includes('Not admin')) {
      return { ok: false, error: '모임 관리자만 초대링크를 폐기할 수 있어요.' };
    }
    return { ok: false, error: '초대링크 폐기에 실패했습니다.' };
  }

  revalidatePath('/more/info');
  return { ok: true };
}
