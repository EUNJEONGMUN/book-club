import { requireAdmin } from '@/lib/auth/membership';
import { notFound } from 'next/navigation';
import { getClubSettings, getPendingApplicants } from '@/lib/queries/club';
import { PendingApplicantsList } from '@/components/club/PendingApplicantsList';

export default async function ApplicantsPage() {
  await requireAdmin();
  const club = await getClubSettings();
  if (!club) notFound();

  const applicants = await getPendingApplicants();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-stone-800">{club.name} 가입 신청자</h1>
        <p className="text-sm text-stone-500 mt-1">{applicants.length}명 대기 중</p>
      </div>
      <PendingApplicantsList initialApplicants={applicants} />
    </div>
  );
}
