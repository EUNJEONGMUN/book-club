import { notFound } from 'next/navigation';
import { getClubById, getPendingApplicants } from '@/lib/queries/clubs';
import { getSupabaseServer } from '@/lib/supabase/server';
import { PendingApplicantsList } from '@/components/club/PendingApplicantsList';

async function assertAdmin(clubId: string): Promise<boolean> {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from('club_members')
    .select('role')
    .eq('club_id', clubId)
    .eq('user_id', user.id)
    .maybeSingle();
  return data?.role === 'admin';
}

export default async function ClubApplicantsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: clubId } = await params;
  const [club, isAdmin] = await Promise.all([getClubById(clubId), assertAdmin(clubId)]);
  if (!club) notFound();
  if (!isAdmin) notFound();

  const applicants = await getPendingApplicants(clubId);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-stone-800">{club.name} 가입 신청자</h1>
        <p className="text-sm text-stone-500 mt-1">{applicants.length}명 대기 중</p>
      </div>
      <PendingApplicantsList clubId={clubId} initialApplicants={applicants} />
    </div>
  );
}
