import { notFound } from 'next/navigation';
import { getClubById, getActiveInvite, getPendingApplicants } from '@/lib/queries/clubs';
import { getSupabaseServer } from '@/lib/supabase/server';
import { InviteLinkPanel } from '@/components/club/InviteLinkPanel';
import { PendingApplicantsList } from '@/components/club/PendingApplicantsList';

async function getCurrentRole(clubId: string): Promise<'admin' | 'member' | 'pending' | null> {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('club_members')
    .select('role')
    .eq('club_id', clubId)
    .eq('user_id', user.id)
    .maybeSingle();
  return (data?.role as 'admin' | 'member' | 'pending' | undefined) ?? null;
}

export default async function ClubSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: clubId } = await params;
  const role = await getCurrentRole(clubId);
  if (role !== 'admin') notFound();

  const [club, invite, applicants] = await Promise.all([
    getClubById(clubId),
    getActiveInvite(clubId),
    getPendingApplicants(clubId),
  ]);
  if (!club) notFound();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold">{club.name} 설정</h1>
        <p className="text-sm text-stone-500">관리자 전용</p>
      </div>
      <InviteLinkPanel clubId={clubId} initialInvite={invite} />
      <PendingApplicantsList clubId={clubId} initialApplicants={applicants} />
    </div>
  );
}
