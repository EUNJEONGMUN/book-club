import { requireMember } from '@/lib/auth/membership';
import { notFound } from 'next/navigation';
import {
  getClubSettings,
  getMembersWithStats,
  getMemberHistory,
  type MemberHistoryItem,
} from '@/lib/queries/club';
import { MemberCard } from '@/components/club/MemberCard';
import { Card } from '@/components/ui/card';

export default async function MembersPage() {
  const { role, user } = await requireMember();
  const viewerId = user.id;
  const club = await getClubSettings();
  if (!club) notFound();

  const members = await getMembersWithStats();

  const canSeeHistory = (memberId: string) =>
    role === 'admin' || (role === 'member' && viewerId === memberId);

  // 권한 있는 멤버 이력만 fetch
  const historyMap = new Map<string, MemberHistoryItem[]>();
  await Promise.all(
    members
      .filter((m) => canSeeHistory(m.user_id))
      .map(async (m) => {
        const h = await getMemberHistory(m.user_id);
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
