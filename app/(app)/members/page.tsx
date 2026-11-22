import { requireMember } from '@/lib/auth/membership';
import { notFound } from 'next/navigation';
import { getClubSettings } from '@/lib/queries/club';
import {
  getMembersWithStats,
  getMemberHistory,
  type MemberHistoryItem,
} from '@/lib/queries/members';
import { MemberCard } from '@/components/club/MemberCard';
import { Card } from '@/components/ui/card';

export default async function MembersPage() {
  const { user } = await requireMember();
  const viewerId = user.id;
  const club = await getClubSettings();
  if (!club) notFound();

  const members = await getMembersWithStats();

  const historyMap = new Map<string, MemberHistoryItem[]>(await Promise.all(
    members.map(async ({ user_id }) => [user_id, await getMemberHistory(user_id)] as const)
  ));

  // 본인 카드 최상단, 나머지는 가나다순 유지
  const sortedMembers = viewerId
    ? [
        ...members.filter((m) => m.user_id === viewerId),
        ...members.filter((m) => m.user_id !== viewerId),
      ]
    : members;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">멤버 {members.length}명</p>
      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          멤버를 볼 수 있는 권한이 없거나 활성 멤버가 없습니다.
        </p>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
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
