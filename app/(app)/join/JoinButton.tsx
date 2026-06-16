'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { applyToClub } from '@/lib/actions/club-members';
import { Button } from '@/components/ui/button';

export function JoinButton({ token }: { token: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    const result = await applyToClub(token);
    if (!result.ok) {
      setSubmitting(false);
      toast.error(result.error);
      return;
    }
    toast.success('가입 신청을 보냈어요. 관리자 승인을 기다려주세요.');
    setSubmitting(false);
    // router.refresh()만 — /join 페이지의 validate_invite_token이 다시 돌면서
    // status='already_pending' 분기로 "신청 완료" 패널 (+ 내 그룹으로 버튼) 자동 노출.
    router.refresh();
  }

  return (
    <Button onClick={submit} disabled={submitting} className="w-full bg-stone-800 hover:bg-stone-700 text-white">
      {submitting ? (
        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />신청 중...</>
      ) : (
        '가입 신청'
      )}
    </Button>
  );
}
