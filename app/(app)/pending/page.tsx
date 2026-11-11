import { getClubName } from '@/lib/club-name';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronRight, RefreshCw, UserRound } from 'lucide-react';
import { getMembership } from '@/lib/auth/membership';
import { LogoutButton } from '../more/logout-button';

const actionClassName = 'flex min-h-16 items-center gap-3 px-5 py-4 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stone-400';

export default async function PendingPage() {
  const membership = await getMembership();
  if (!membership) redirect('/login');
  if (membership.role === 'admin' || membership.role === 'member') redirect('/');
  if (membership.role !== 'pending') redirect('/onboarding');
  const clubName = await getClubName();
  return (
    <div className="space-y-5 py-12">
      <h1 className="text-xl font-bold">가입 승인 대기 중</h1>
      <p className="text-sm text-stone-600">{clubName}에 가입 신청을 보냈어요. 관리자가 승인하면 모임을 이용할 수 있어요.</p>

      <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm">
        <a href="/" className={actionClassName}>
          <RefreshCw aria-hidden="true" className="size-5 shrink-0 text-stone-500" />
          <span className="flex-1">승인 상태 다시 확인</span>
          <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-stone-400" />
        </a>
        <Link href="/more/profile" className={actionClassName}>
          <UserRound aria-hidden="true" className="size-5 shrink-0 text-stone-500" />
          <span className="flex-1">내 프로필</span>
          <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-stone-400" />
        </Link>
      </div>

      <LogoutButton />
    </div>
  );
}
