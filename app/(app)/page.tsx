import { redirect } from 'next/navigation';
import { getMyClubs, getMyPendingClubs } from '@/lib/queries/clubs';

export default async function EntryRouterPage() {
  const [clubs, pending] = await Promise.all([getMyClubs(), getMyPendingClubs()]);
  // pending만 있어도 /clubs로 — 거기서 "승인 대기 중" 섹션을 봄
  if (clubs.length === 0 && pending.length === 0) redirect('/onboarding');
  redirect('/clubs');
}
