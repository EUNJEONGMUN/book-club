import { getClubName } from '@/lib/club-name';
import { redirect } from 'next/navigation';
import { getMembership } from '@/lib/auth/membership';
import OnboardingForm from './onboarding-form';
export default async function OnboardingPage() {
  const membership = await getMembership();
  if (!membership) redirect('/login');
  if (membership.role === 'admin' || membership.role === 'member') redirect('/');
  if (membership.role === 'pending') redirect('/pending');
  return <OnboardingForm clubName={await getClubName()} />;
}
