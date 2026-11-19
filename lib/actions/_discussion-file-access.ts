import { DISCUSSION_FILE_PUBLIC_PATH } from '@/lib/discussion-file';
import { getMembership } from '@/lib/auth/membership';
import { canEditMeeting } from '@/lib/meeting-permissions';
import { getSupabaseServer } from '@/lib/supabase/server';

export const FILE_CHANGED = '모임 정보가 변경되었습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.';

export async function assertDiscussionFileEditor(meetingId: string) {
  const membership = await getMembership();
  if (!membership) return { ok: false as const, error: '로그인이 필요합니다.', supabase: null };
  const { user, role } = membership;
  const supabase = await getSupabaseServer();

  const { data: meeting, error } = await supabase
    .from('meetings')
    .select('created_by, scheduled_at, discussion_file_url, updated_at')
    .eq('id', meetingId)
    .maybeSingle();
  if (error) return { ok: false as const, error: '모임을 찾을 수 없습니다.', supabase: null };
  if (!meeting) return { ok: false as const, error: '모임을 찾을 수 없습니다.', supabase: null, missingForUserId: user.id };
  if (!canEditMeeting(meeting, user.id, role)) return { ok: false as const, error: '발제 자료를 수정할 권한이 없어요.', supabase: null };

  return { ok: true as const, supabase, meeting, userId: user.id };
}

export function publicUrlToPath(url: string | null, meetingId: string): string | null {
  if (!url) return null;
  try {
    const { origin, pathname } = new URL(url);
    if (origin !== new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin || !pathname.startsWith(DISCUSSION_FILE_PUBLIC_PATH)) {
      return null;
    }
    const path = decodeURIComponent(pathname.slice(DISCUSSION_FILE_PUBLIC_PATH.length));
    if (!path.startsWith(`${meetingId}/`) || path.split('/').some(part => !part || part === '.' || part === '..')) {
      return null;
    }
    return path;
  } catch {
    return null;
  }
}
