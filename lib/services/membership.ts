
import { revalidatePath } from 'next/cache';
import * as Sentry from '@sentry/nextjs';
import { getSupabaseServer } from '@/lib/supabase/server';
import { notifyAdminsOnApply } from '@/lib/notifications/admin-apply';

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
    if (error.message?.includes('Invite expired')) {
      return { ok: false, error: '만료된 초대 링크입니다. 관리자에게 새 링크를 요청해주세요.' };
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
  if (result.status === 'already_member' || result.status === 'already_pending') {
    return { ok: true, clubName: result.club_name };
  }

  // 신규 신청 — admin들에게 이메일 알림 (fire-and-forget, 실패해도 응답엔 영향 X)
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle();
    const applicantName = profile?.display_name ?? '익명';
    // 비동기 fire-and-forget — 호출자는 기다리지 않음
    notifyAdminsOnApply({
      clubName: result.club_name,
      applicantDisplayName: applicantName,
    }).catch((e) => {
      console.error('[applyForMembership:notify]', e);
      Sentry.captureException(e, { tags: { notification: 'admin-apply-fail' } });
    });
  }

  return { ok: true, clubName: result.club_name };
}

export async function approveMember(userId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const supabase = await getSupabaseServer();
  // .select()로 변경된 row를 받아야 RLS가 조용히 0 rows로 차단했는지 알 수 있음
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
  revalidatePath('/more');
  return { ok: true };
}

export async function rejectMember(userId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
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
  revalidatePath('/more');
  return { ok: true };
}

export async function transferAdmin(
  newAdminUserId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc('transfer_admin', {
    new_admin_user_id: newAdminUserId,
  });

  if (error) {
    console.error('[transferAdmin]', error);
    Sentry.captureException(error, { tags: { action: 'transferAdmin' } });
    if (error.message?.includes('Not authenticated')) {
      return { ok: false, error: '로그인이 필요합니다.' };
    }
    if (error.message?.includes('Not admin')) {
      return { ok: false, error: '모임 관리자만 이양할 수 있어요.' };
    }
    if (error.message?.includes('Cannot transfer admin to yourself')) {
      return { ok: false, error: '본인에게는 이양할 수 없어요.' };
    }
    if (error.message?.includes('Target user is not a member')) {
      return { ok: false, error: '대상이 부글부글의 멤버가 아닙니다.' };
    }
    if (error.message?.includes('Target user is still pending approval')) {
      return { ok: false, error: '승인 대기 중인 사용자에게는 이양할 수 없어요.' };
    }
    return { ok: false, error: '관리자 이양에 실패했어요.' };
  }

  revalidatePath('/more');
  return { ok: true };
}

export async function leaveMembership(): Promise<
  { ok: true } | { ok: false; error: string }
> {
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

  revalidatePath('/');
  return { ok: true };
}
