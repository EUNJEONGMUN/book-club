import { notFound } from 'next/navigation';
import {
  getClubById,
  getClubMembersWithStats,
  getMemberHistoryInClub,
  type MemberHistoryItem,
} from '@/lib/queries/clubs';
import { getSupabaseServer } from '@/lib/supabase/server';
import { MemberCard } from '@/components/club/MemberCard';
import { Card } from '@/components/ui/card';

async function getCurrentRole(clubId: string): Promise<{
  role: 'admin' | 'member' | null;
  userId: string | null;
}> {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { role: null, userId: null };
  const { data } = await supabase
    .from('club_members')
    .select('role')
    .eq('club_id', clubId)
    .eq('user_id', user.id)
    .maybeSingle();
  const role = data?.role;
  if (role === 'admin' || role === 'member') return { role, userId: user.id };
  return { role: null, userId: user.id };
}

export default async function ClubMembersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: clubId } = await params;
  const club = await getClubById(clubId);
  if (!club) notFound();

  const [members, { role, userId: viewerId }] = await Promise.all([
    getClubMembersWithStats(clubId),
    getCurrentRole(clubId),
  ]);

  const canSeeHistory = (memberId: string) =>
    role === 'admin' || (role === 'member' && viewerId === memberId);

  // 권한 있는 멤버 이력만 fetch
  const historyMap = new Map<string, MemberHistoryItem[]>();
  await Promise.all(
    members
      .filter((m) => canSeeHistory(m.user_id))
      .map(async (m) => {
        const h = await getMemberHistoryInClub(clubId, m.user_id);
        historyMap.set(m.user_id, h);
      })
  );

  // 본인 카드 최상단, 나머지는 가나다순 유지
  const sortedMembers = viewerId
    ? [
        ...members.filter((m) => m.user_id === viewerId),
        ...members.filter((m) => m.user_id !== viewerId),
      ]
    : members;

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-500">멤버 {members.length}명</p>
      {members.length === 0 ? (
        <p className="text-sm text-stone-500 py-8 text-center">
          멤버를 볼 수 있는 권한이 없거나 활성 멤버가 없습니다.
        </p>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-stone-100">
            {sortedMembers.map((m) => (
              <li key={m.user_id}>
                <MemberCard
                  member={m}
                  history={historyMap.get(m.user_id)}
                  defaultExpanded={m.user_id === viewerId}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
