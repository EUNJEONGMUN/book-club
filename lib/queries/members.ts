import { getSupabaseServer } from '@/lib/supabase/server';

export type MemberHistoryItem = {
  meeting_id: string;
  book_title: string;
  scheduled_at: string;
  is_host: boolean;
};

export async function getMemberHistory(userId: string): Promise<MemberHistoryItem[]> {
  const supabase = await getSupabaseServer();

  const [{ data: attended }, { data: hosted }] = await Promise.all([
    supabase
      .from('attendances')
      .select('meeting_id, meetings(book_title, scheduled_at)')
      .eq('user_id', userId)
      .eq('status', 'attending'),
    supabase
      .from('meetings')
      .select('id, book_title, scheduled_at')
      .eq('host_id', userId),
  ]);

  const map = new Map<string, MemberHistoryItem>();

  // 발제한 모임 먼저 (is_host=true 우선)
  hosted?.forEach((m) => {
    map.set(m.id, {
      meeting_id: m.id,
      book_title: m.book_title,
      scheduled_at: m.scheduled_at,
      is_host: true,
    });
  });

  // 참석한 모임 (발제 아닌 경우만)
  attended?.forEach((a) => {
    if (!map.has(a.meeting_id)) {
      const m = a.meetings as { book_title: string; scheduled_at: string } | null;
      if (m) {
        map.set(a.meeting_id, {
          meeting_id: a.meeting_id,
          book_title: m.book_title,
          scheduled_at: m.scheduled_at,
          is_host: false,
        });
      }
    }
  });

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()
  );
}

export async function getCurrentProfile() {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  return data;
}
