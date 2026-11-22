'use server';

import { revalidatePath } from 'next/cache';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { requireMember, requireAdmin } from '@/lib/auth/membership';
import { getSupabaseServer } from '@/lib/supabase/server';
import { notifyAdminsOnApply } from '@/lib/notifications/admin-apply';

const clubSettingsSchema = z.object({
  name: z.string().trim().min(1, '모임 이름을 입력해주세요.').max(50, '모임 이름은 50자 이내로 입력해주세요.'),
  description: z.string().trim().max(500, '설명은 500자 이내로 입력해주세요.').optional().nullable(),
});

function refreshMembership() {
  for (const path of ['/', '/members', '/more', '/more/info', '/more/applicants', '/pending']) revalidatePath(path);
}

function refreshClubSettings() {
  for (const path of ['/', '/more', '/login', '/signup', '/pending', '/onboarding']) revalidatePath(path);
}

export async function approveMember(userId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  await requireAdmin();
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('members')
    .update({ role: 'member' })
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
  refreshMembership();
  return { ok: true };
}

export async function rejectMember(userId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  await requireAdmin();
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('members')
    .delete()
    .eq('user_id', userId)
    .eq('role', 'pending')
    .select('user_id');

  if (error) {
    console.error('[rejectMember]', error);
    Sentry.captureException(error, { tags: { action: 'rejectMember' } });
    return { ok: false, error: '거절에 실패했습니다.' };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: '권한이 없거나 이미 처리된 신청입니다.' };
  }
  refreshMembership();
  return { ok: true };
}

export async function leaveMembership(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  await requireMember();
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: '로그인이 필요합니다.' };
  }

  // Guard: admins must transfer or delete first.
  const { data: row } = await supabase
    .from('members')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (row?.role === 'admin') {
    return {
      ok: false,
      error: '관리자는 탈퇴할 수 없어요. 다른 멤버에게 관리자 권한을 이양해주세요.',
    };
  }

  const { error } = await supabase
    .from('members')
    .delete()
    .eq('user_id', user.id);

  if (error) {
    console.error('[leaveMembership]', error);
    Sentry.captureException(error, { tags: { action: 'leaveMembership' } });
    return { ok: false, error: '모임 탈퇴에 실패했어요.' };
  }
  refreshMembership();
  return { ok: true };
}

export async function rotateInvite(): Promise<
  { ok: true; invite: { token: string } } | { ok: false; error: string }
> {
  await requireAdmin();
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
  await requireAdmin();
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

export async function updateClubSettings(input: {
  name: string;
  description?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const parsed = clubSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' };
  }

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('club_settings')
    .update({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
    })
    .eq('id', 1)
    .select('id');

  if (error) {
    console.error('[updateClubSettings]', error);
    Sentry.captureException(error, { tags: { action: 'updateClubSettings' } });
    return { ok: false, error: '모임 정보를 저장하지 못했습니다.' };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: '모임 관리자만 정보를 수정할 수 있어요.' };
  }

  refreshClubSettings();
  return { ok: true };
}

export async function applyForMembership(token: string): Promise<
  { ok: true; clubName: string } | { ok: false; error: string }
> {
  if (typeof token !== 'string' || !token.trim()) {
    return { ok: false, error: '관리자에게 초대 링크를 요청해주세요.' };
  }

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.rpc('apply_for_membership', { invite_token: token });

  if (error) {
    console.error('[applyForMembership]', error);
    Sentry.captureException(error, { tags: { action: 'applyForMembership' } });
    if (error.message?.includes('Not authenticated')) {
      return { ok: false, error: '로그인이 필요합니다.' };
    }
    if (error.message?.includes('Invalid invite')) {
      return { ok: false, error: '잘못된 초대 링크입니다. 관리자에게 새 링크를 요청해주세요.' };
    }
    if (error.message?.includes('Invite revoked')) {
      return { ok: false, error: '취소된 초대 링크입니다. 관리자에게 새 링크를 요청해주세요.' };
    }
    return { ok: false, error: '가입 신청에 실패했습니다.' };
  }
  if (!data) {
    return { ok: false, error: '가입 신청에 실패했습니다.' };
  }

  const result = data as {
    status: 'applied' | 'already_member' | 'already_pending';
    club_name: string;
  };

  // 신규 신청 — admin들에게 이메일 알림 (fire-and-forget, 실패해도 응답엔 영향 X)
  if (result.status === 'applied') {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .maybeSingle();
      const applicantName = profile?.display_name ?? '익명';
      notifyAdminsOnApply({
        clubName: result.club_name,
        applicantDisplayName: applicantName,
      }).catch((e) => {
        console.error('[applyForMembership:notify]', e);
        Sentry.captureException(e, { tags: { notification: 'admin-apply-fail' } });
      });
    }
  }

  refreshMembership();
  return { ok: true, clubName: result.club_name };
}
