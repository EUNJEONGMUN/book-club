import { getSupabaseServer } from '@/lib/supabase/server';

export type MemberStats = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  attended_count: number;
  hosted_count: number;
};

export type PendingMember = {
  id: string;
  display_name: string;
  joined_at: string;
};

export type MemberHistoryItem = {
  meeting_id: string;
  book_title: string;
  scheduled_at: string;
  is_host: boolean;
};

export async function getAllMembersWithStats(): Promise<MemberStats[]> {
  const supabase = await getSupabaseServer();
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .eq('approved', true)
    .order('display_name', { ascending: true });
  if (error) throw error;

  const [attended, hosted] = await Promise.all([
    supabase.from('attendances').select('user_id').eq('status', 'attending'),
    supabase.from('meetings').select('host_id'),
  ]);

  const attendedMap = new Map<string, number>();
  attended.data?.forEach((r) => attendedMap.set(r.user_id, (attendedMap.get(r.user_id) ?? 0) + 1));
  const hostedMap = new Map<string, number>();
  hosted.data?.forEach((r) => hostedMap.set(r.host_id, (hostedMap.get(r.host_id) ?? 0) + 1));

  return (profiles ?? []).map((p) => ({
    ...p,
    attended_count: attendedMap.get(p.id) ?? 0,
    hosted_count: hostedMap.get(p.id) ?? 0,
  }));
}

export async function getPendingMembers(): Promise<PendingMember[]> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, joined_at')
    .eq('approved', false)
    .order('joined_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

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
