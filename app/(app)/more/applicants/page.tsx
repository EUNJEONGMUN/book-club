import { requireAdmin } from '@/lib/auth/membership';
import { notFound } from 'next/navigation';
import { getClubSettings } from '@/lib/queries/club';
import { getPendingApplicants } from '@/lib/queries/members';
import { PendingApplicantsList } from '@/components/settings/PendingApplicantsList';
import { SettingsBackLink } from '../settings-back-link';

export default async function ApplicantsPage() {
  await requireAdmin();
  const club = await getClubSettings();
  if (!club) notFound();

  const applicants = await getPendingApplicants();

  return (
    <div className="space-y-5 pb-4">
      <SettingsBackLink />
      <div>
        <h1 className="text-xl font-bold text-foreground">{club.name} 가입 신청자</h1>
        <p className="text-sm text-muted-foreground mt-1">{applicants.length}명 대기 중</p>
      </div>
      <PendingApplicantsList initialApplicants={applicants} />
    </div>
  );
}
