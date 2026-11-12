import { DISCUSSION_FILE_PUBLIC_PATH } from '@/lib/discussion-file';
import { getSupabaseServer } from '@/lib/supabase/server';

export const FILE_CHANGED = '모임 정보가 변경되었습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.';

export async function assertDiscussionFileHost(meetingId: string) {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: '로그인이 필요합니다.', supabase: null };

  const { data: meeting, error } = await supabase
    .from('meetings')
    .select('host_id, discussion_file_url, updated_at')
    .eq('id', meetingId)
    .maybeSingle();
  if (error) return { ok: false as const, error: '모임을 찾을 수 없습니다.', supabase: null };
  if (!meeting) return { ok: false as const, error: '모임을 찾을 수 없습니다.', supabase: null, missingForUserId: user.id };
  if (meeting.host_id !== user.id) return { ok: false as const, error: '발제자만 사용할 수 있습니다.', supabase: null };

  return { ok: true as const, supabase, meeting };
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
