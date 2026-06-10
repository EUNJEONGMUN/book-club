'use server';

import { revalidatePath } from 'next/cache';
import * as Sentry from '@sentry/nextjs';
import { getSupabaseServer } from '@/lib/supabase/server';

export async function applyToClub(token: string): Promise<
  { ok: true; clubId: string; clubName: string } | { ok: false; error: string }
> {
  const trimmed = token.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: '초대코드를 입력해주세요.' };
  }

  // Accept either a raw token or a full /join?token=... URL.
  let parsedToken = trimmed;
  try {
    const url = new URL(trimmed);
    const t = url.searchParams.get('token');
    if (t) parsedToken = t;
  } catch {
    // Not a URL — use as-is.
  }

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.rpc('apply_to_club', { invite_token: parsedToken });

  if (error) {
    console.error('[applyToClub]', error);
    Sentry.captureException(error, { tags: { action: 'applyToClub' } });
    if (error.message?.includes('Not authenticated')) {
      return { ok: false, error: '로그인이 필요합니다.' };
    }
    if (error.message?.includes('Invalid invite')) {
      return { ok: false, error: '유효하지 않은 초대코드입니다.' };
    }
    if (error.message?.includes('Invite revoked')) {
      return { ok: false, error: '취소된 초대링크입니다. admin에게 새 링크를 요청해주세요.' };
    }
    if (error.message?.includes('Invite expired')) {
      return { ok: false, error: '만료된 초대링크입니다. admin에게 새 링크를 요청해주세요.' };
    }
    return { ok: false, error: '가입 신청에 실패했습니다.' };
  }
  if (!data) {
    return { ok: false, error: '가입 신청에 실패했습니다.' };
  }

  const result = data as { club_id: string; club_name: string };
  return { ok: true, clubId: result.club_id, clubName: result.club_name };
}

export async function approveMember(clubId: string, userId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from('club_members')
    .update({ role: 'member' })
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .eq('role', 'pending');

  if (error) {
    console.error('[approveMember]', error);
    Sentry.captureException(error, { tags: { action: 'approveMember' } });
    return { ok: false, error: '승인에 실패했습니다.' };
  }
  revalidatePath(`/clubs/${clubId}/settings`);
  return { ok: true };
}

export async function rejectMember(clubId: string, userId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from('club_members')
    .delete()
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .eq('role', 'pending');

  if (error) {
    console.error('[rejectMember]', error);
    Sentry.captureException(error, { tags: { action: 'rejectMember' } });
    return { ok: false, error: '거절에 실패했습니다.' };
  }
  revalidatePath(`/clubs/${clubId}/settings`);
  return { ok: true };
}
