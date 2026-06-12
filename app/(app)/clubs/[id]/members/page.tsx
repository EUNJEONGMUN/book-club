import { notFound } from 'next/navigation';
import { getClubById, getClubMembersWithStats } from '@/lib/queries/clubs';
import { MemberCard } from '@/components/club/MemberCard';

export default async function ClubMembersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: clubId } = await params;
  const club = await getClubById(clubId);
  if (!club) notFound();

  const members = await getClubMembersWithStats(clubId);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-stone-800">{club.name} 멤버</h1>
        <p className="text-sm text-stone-500 mt-1">전체 {members.length}명</p>
      </div>
      {members.length === 0 ? (
        <p className="text-sm text-stone-500 py-8 text-center">
          멤버를 볼 수 있는 권한이 없거나 활성 멤버가 없습니다.
        </p>
      ) : (
        <ul className="space-y-3">
          {members.map((m) => (
            <li key={m.user_id}>
              <MemberCard member={m} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
