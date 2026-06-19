'use server';

import * as Sentry from '@sentry/nextjs';
import { getSupabaseServer } from '@/lib/supabase/server';
import { reviewFormSchema } from '@/lib/validation/review';
import { revalidateMeetingPaths } from './_revalidate-meeting';

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * 한줄 평 작성/수정 (upsert). 모임이 끝난 후만 허용.
 * RLS가 본인+클럽멤버 체크 — 비인가 호출이면 0 rows.
 */
export async function upsertMyReview(
  meetingId: string,
  input: unknown
): Promise<ActionResult> {
  const parsed = reviewFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' };
  }

  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요합니다.' };

  // 모임이 이미 끝났는지 확인 — UI에서도 막지만 서버 가드
  const { data: meeting } = await supabase
    .from('meetings')
    .select('scheduled_at')
    .eq('id', meetingId)
    .maybeSingle();
  if (!meeting) return { ok: false, error: '모임을 찾을 수 없습니다.' };
  if (new Date(meeting.scheduled_at) > new Date()) {
    return { ok: false, error: '모임이 끝난 후에 한줄 평을 남길 수 있어요.' };
  }

  const { data, error } = await supabase
    .from('meeting_reviews')
    .upsert(
      {
        meeting_id: meetingId,
        user_id: user.id,
        content: parsed.data.content,
        visibility: parsed.data.visibility,
      },
      { onConflict: 'meeting_id,user_id' }
    )
    .select('id');

  if (error) {
    console.error('[upsertMyReview]', error);
    Sentry.captureException(error, { tags: { action: 'upsertMyReview' } });
    return { ok: false, error: '저장에 실패했습니다.' };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: '권한이 없거나 모임 정보를 확인할 수 없어요.' };
  }
  await revalidateMeetingPaths(meetingId);
  return { ok: true };
}

export async function deleteMyReview(meetingId: string): Promise<ActionResult> {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요합니다.' };

  const { error } = await supabase
    .from('meeting_reviews')
    .delete()
    .eq('meeting_id', meetingId)
    .eq('user_id', user.id);

  if (error) {
    console.error('[deleteMyReview]', error);
    Sentry.captureException(error, { tags: { action: 'deleteMyReview' } });
    return { ok: false, error: '삭제에 실패했습니다.' };
  }
  await revalidateMeetingPaths(meetingId);
  return { ok: true };
}
