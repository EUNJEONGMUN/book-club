import { notFound } from 'next/navigation';
import { getClubById, getClubMembersWithStats } from '@/lib/queries/clubs';
import { getSupabaseServer } from '@/lib/supabase/server';
import { MemberCard } from '@/components/club/MemberCard';

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

  const canSeeDetail = (memberId: string) =>
    role === 'admin' || (role === 'member' && viewerId === memberId);

  // 본인 카드 최상단, 나머지는 기존 가나다순 유지
  const sortedMembers = viewerId
    ? [
        ...members.filter((m) => m.user_id === viewerId),
        ...members.filter((m) => m.user_id !== viewerId),
      ]
    : members;

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
          {sortedMembers.map((m) => (
            <li key={m.user_id}>
              <MemberCard
                member={m}
                detailHref={
                  canSeeDetail(m.user_id) ? `/clubs/${clubId}/members/${m.user_id}` : undefined
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
