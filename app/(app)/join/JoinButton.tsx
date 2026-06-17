'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Check } from 'lucide-react';
import { applyToClub } from '@/lib/actions/club-members';
import { Button } from '@/components/ui/button';

export function JoinButton({ token }: { token: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  // server refresh가 끝나기 전까지 inline "신청 완료" 표시용.
  // refresh 완료되면 부모 page가 already_pending 패널로 통째로 바꿈 (이 컴포넌트 unmount).
  const [submitted, setSubmitted] = useState(false);

  async function submit() {
    if (submitting || submitted) return;
    setSubmitting(true);
    const result = await applyToClub(token);
    if (!result.ok) {
      setSubmitting(false);
      toast.error(result.error);
      return;
    }
    toast.success('가입 신청을 보냈어요. 관리자 승인을 기다려주세요.');
    setSubmitting(false);
    setSubmitted(true);
    router.refresh();
  }

  if (submitted) {
    return (
      <Button disabled className="w-full bg-stone-300 text-stone-600 hover:bg-stone-300">
        <Check className="w-4 h-4 mr-2" />
        신청 완료 — 관리자 승인 대기 중
      </Button>
    );
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
