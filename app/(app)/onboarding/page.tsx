import { getClubName } from '@/lib/club-name';
import { redirect } from 'next/navigation';
import { getMembership } from '@/lib/auth/membership';
export default async function OnboardingPage() {
  const membership = await getMembership();
  if (!membership) redirect('/login');
  if (membership.role === 'admin' || membership.role === 'member') redirect('/');
  if (membership.role === 'pending') redirect('/pending');
  const clubName = await getClubName();
  return (
    <div className="space-y-3 py-12">
      <h1 className="text-xl font-bold">{clubName} 초대 링크가 필요해요</h1>
      <p className="text-sm text-stone-600">
        관리자에게 받은 초대 링크를 열어 가입을 신청해주세요.
        링크가 없거나 잃어버렸다면 관리자에게 다시 요청해주세요.
      </p>
    </div>
  );
}
