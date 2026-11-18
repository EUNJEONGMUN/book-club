import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/queries/members';
import { getMembership } from '@/lib/auth/membership';
import { GoogleConnection } from './google-connection';
import { ProfileForm } from './profile-form';

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>;
}) {
  const [membership, profile] = await Promise.all([getMembership(), getCurrentProfile()]);
  if (!membership || !profile) redirect('/login');
  const { user } = membership;
  const { google: result } = await searchParams;
  const hasEmail = user.identities?.some(({ provider }) => provider === 'email');
  const hasGoogle = user.identities?.some(({ provider }) => provider === 'google') ?? false;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">프로필</h1>
      <ProfileForm defaultName={profile.display_name} avatarUrl={profile.avatar_url} />
      <GoogleConnection email={hasEmail ? user.email : undefined} hasGoogle={hasGoogle} result={result} />
    </div>
  );
}
