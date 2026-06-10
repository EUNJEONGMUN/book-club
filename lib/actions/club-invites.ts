'use server';

import { revalidatePath } from 'next/cache';
import * as Sentry from '@sentry/nextjs';
import { getSupabaseServer } from '@/lib/supabase/server';

export async function rotateInvite(clubId: string): Promise<
  { ok: true; token: string } | { ok: false; error: string }
> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.rpc('rotate_invite', { target_club_id: clubId });

  if (error) {
    console.error('[rotateInvite]', error);
    Sentry.captureException(error, { tags: { action: 'rotateInvite' } });
    if (error.message?.includes('Not authenticated')) {
      return { ok: false, error: '로그인이 필요합니다.' };
    }
    if (error.message?.includes('Not admin')) {
      return { ok: false, error: '그룹 관리자만 초대링크를 발급할 수 있어요.' };
    }
    return { ok: false, error: '초대링크 발급에 실패했습니다.' };
  }
  if (!data) {
    return { ok: false, error: '초대링크 발급에 실패했습니다.' };
  }

  revalidatePath(`/clubs/${clubId}/settings`);
  return { ok: true, token: data as string };
}
