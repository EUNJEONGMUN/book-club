'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { applyForMembership } from '@/lib/actions/club';
import { Button } from '@/components/ui/button';

export function JoinButton({ token }: { token: string }) {
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const result = await applyForMembership(token);
      if (result.ok) {
        window.location.replace('/pending');
        return;
      }
      toast.error(result.error);
    } catch {
      toast.error('가입 신청을 확인하지 못했어요. 잠시 후 다시 시도해주세요.');
    }
    setSubmitting(false);
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
