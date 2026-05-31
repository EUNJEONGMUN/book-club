import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/queries/members';
import { ProfileForm } from './profile-form';

export default async function ProfilePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">프로필</h1>
      <ProfileForm defaultName={profile.display_name} avatarUrl={profile.avatar_url} />
    </div>
  );
}
