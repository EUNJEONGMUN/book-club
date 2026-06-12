import { notFound } from 'next/navigation';
import {
  getClubById,
  getActiveInvite,
  getClubActiveMembers,
} from '@/lib/queries/clubs';
import { getSupabaseServer } from '@/lib/supabase/server';
import { InviteLinkPanel } from '@/components/club/InviteLinkPanel';
import { ClubInfoPanel } from '@/components/club/ClubInfoPanel';
import { ClubInfoReadOnly } from '@/components/club/ClubInfoReadOnly';
import { AdminTransferSection } from '@/components/club/AdminTransferSection';
import { DangerZoneSection } from '@/components/club/DangerZoneSection';

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

export default async function ClubSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: clubId } = await params;
  const { role, userId } = await getCurrentRole(clubId);
  if (!role || !userId) notFound();

  const club = await getClubById(clubId);
  if (!club) notFound();

  if (role === 'admin') {
    const [invite, members] = await Promise.all([
      getActiveInvite(clubId),
      getClubActiveMembers(clubId),
    ]);

    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-xl font-bold">{club.name} 설정</h1>
          <p className="text-sm text-stone-500">관리자 전용</p>
        </div>
        <ClubInfoPanel club={club} />
        <InviteLinkPanel clubId={clubId} initialInvite={invite} />
        <AdminTransferSection clubId={clubId} activeMembers={members} currentUserId={userId} />
        <DangerZoneSection clubId={clubId} clubName={club.name} isAdmin={true} />
      </div>
    );
  }

  // member view
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold">{club.name} 설정</h1>
        <p className="text-sm text-stone-500">멤버</p>
      </div>
      <ClubInfoReadOnly club={club} />
      <DangerZoneSection clubId={clubId} clubName={club.name} isAdmin={false} />
    </div>
  );
}
