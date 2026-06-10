import { redirect } from 'next/navigation';
import { getMyClubs } from '@/lib/queries/clubs';

export default async function EntryRouterPage() {
  const clubs = await getMyClubs();
  if (clubs.length === 0) redirect('/onboarding');
  redirect('/clubs');
}
