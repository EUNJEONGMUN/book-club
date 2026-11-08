'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { leaveMembership } from '@/lib/actions/club';
import { Button } from '@/components/ui/button';
export function DangerZoneSection({ clubName, isAdmin }: { clubName: string; isAdmin: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (isAdmin) return null;
  async function handleLeave() {
    if (busy || !confirm(`정말 "${clubName}"에서 탈퇴할까요? 다시 참여하려면 초대코드로 가입 신청이 필요해요.`)) return;
    setBusy(true);
    try {
      const result = await leaveMembership();
      if (!result.ok) { toast.error(result.error); return; }
      toast.success(`${clubName}에서 탈퇴했어요.`);
      router.push('/onboarding');
      router.refresh();
    } finally { setBusy(false); }
  }
  return <section className="space-y-3 border-t pt-4">
    <p className="text-sm text-stone-600">탈퇴하면 모임 기록을 더 이상 볼 수 없어요.</p>
    <Button variant="outline" onClick={handleLeave} disabled={busy}>{busy ? '처리 중...' : '모임 탈퇴'}</Button>
  </section>;
}
