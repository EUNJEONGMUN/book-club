import { getClubName } from '@/lib/club-name';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMembership } from '@/lib/auth/membership';
import { LogoutButton } from '../more/logout-button';
export default async function PendingPage() {
  const membership = await getMembership();
  if (!membership) redirect('/login');
  if (membership.role === 'admin' || membership.role === 'member') redirect('/');
  if (membership.role !== 'pending') redirect('/onboarding');
  const clubName = await getClubName();
  return <div className="space-y-5 py-12">
    <h1 className="text-xl font-bold">가입 승인 대기 중</h1>
    <p className="text-sm text-stone-600">{clubName}에 가입 신청을 보냈어요. 관리자가 승인하면 모임을 이용할 수 있어요.</p>
    <Link href="/" className="block underline text-sm">승인 상태 다시 확인</Link>
    <Link href="/more/profile" className="block underline text-sm">내 프로필</Link>
    <LogoutButton />
  </div>;
}
