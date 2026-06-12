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

  const result = data as {
    status: 'applied' | 'already_member' | 'already_pending';
    club_id: string;
    club_name: string;
  };
  if (result.status === 'already_member') {
    return { ok: false, error: '이미 가입된 그룹입니다.' };
  }
  if (result.status === 'already_pending') {
    return {
      ok: false,
      error: '이미 신청한 그룹입니다. admin 승인을 기다려주세요.',
    };
  }
  return { ok: true, clubId: result.club_id, clubName: result.club_name };
}

export async function approveMember(clubId: string, userId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const supabase = await getSupabaseServer();
  // .select()로 변경된 row를 받아야 RLS가 조용히 0 rows로 차단했는지 알 수 있음
  const { data, error } = await supabase
    .from('club_members')
    .update({ role: 'member' })
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .eq('role', 'pending')
    .select('user_id');

  if (error) {
    console.error('[approveMember]', error);
    Sentry.captureException(error, { tags: { action: 'approveMember' } });
    return { ok: false, error: '승인에 실패했습니다.' };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: '권한이 없거나 이미 처리된 신청입니다.' };
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

export async function transferAdmin(
  clubId: string,
  newAdminUserId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc('transfer_admin', {
    target_club_id: clubId,
    new_admin_user_id: newAdminUserId,
  });

  if (error) {
    console.error('[transferAdmin]', error);
    Sentry.captureException(error, { tags: { action: 'transferAdmin' } });
    if (error.message?.includes('Not authenticated')) {
      return { ok: false, error: '로그인이 필요합니다.' };
    }
    if (error.message?.includes('Not admin')) {
      return { ok: false, error: '그룹 관리자만 이양할 수 있어요.' };
    }
    if (error.message?.includes('Cannot transfer admin to yourself')) {
      return { ok: false, error: '본인에게는 이양할 수 없어요.' };
    }
    if (error.message?.includes('Target user is not in this club')) {
      return { ok: false, error: '대상이 이 그룹의 멤버가 아닙니다.' };
    }
    if (error.message?.includes('Target user is still pending approval')) {
      return { ok: false, error: '승인 대기 중인 사용자에게는 이양할 수 없어요.' };
    }
    return { ok: false, error: '관리자 이양에 실패했어요.' };
  }

  revalidatePath(`/clubs/${clubId}/settings`);
  return { ok: true };
}

export async function leaveClub(clubId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: '로그인이 필요합니다.' };
  }

  // Guard: admins must transfer or delete first.
  const { data: row } = await supabase
    .from('club_members')
    .select('role')
    .eq('club_id', clubId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (row?.role === 'admin') {
    return {
      ok: false,
      error: '관리자는 탈퇴할 수 없어요. 다른 멤버에게 이양하거나 그룹을 삭제해주세요.',
    };
  }

  const { error } = await supabase
    .from('club_members')
    .delete()
    .eq('club_id', clubId)
    .eq('user_id', user.id);

  if (error) {
    console.error('[leaveClub]', error);
    Sentry.captureException(error, { tags: { action: 'leaveClub' } });
    return { ok: false, error: '그룹 탈퇴에 실패했어요.' };
  }

  revalidatePath('/clubs');
  return { ok: true };
}

export async function deleteClub(clubId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const supabase = await getSupabaseServer();
  const { error } = await supabase.from('clubs').delete().eq('id', clubId);

  if (error) {
    console.error('[deleteClub]', error);
    Sentry.captureException(error, { tags: { action: 'deleteClub' } });
    return { ok: false, error: '그룹 삭제에 실패했어요.' };
  }

  revalidatePath('/clubs');
  return { ok: true };
}
