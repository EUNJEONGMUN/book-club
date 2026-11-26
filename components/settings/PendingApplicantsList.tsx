'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, X, Loader2, UserPlus } from 'lucide-react';
import { approveMember, rejectMember } from '@/lib/actions/club';
import { formatMeetingDateTime } from '@/lib/meeting-time';
import { Button } from '@/components/ui/button';
import type { PendingApplicant } from '@/lib/queries/members';

export function PendingApplicantsList({
  initialApplicants,
}: {
  initialApplicants: PendingApplicant[];
}) {
  const router = useRouter();
  const [applicants, setApplicants] = useState(initialApplicants);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  function mark(userId: string, on: boolean) {
    setPending((prev) => {
      const next = new Set(prev);
      if (on) next.add(userId);
      else next.delete(userId);
      return next;
    });
  }

  function handleApprove(userId: string) {
    mark(userId, true);
    startTransition(async () => {
      const result = await approveMember(userId);
      mark(userId, false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success('가입을 승인했어요.');
      setApplicants((prev) => prev.filter((a) => a.user_id !== userId));
      router.refresh();
    });
  }

  function handleReject(userId: string) {
    if (!confirm('가입 신청을 거절할까요?')) return;
    mark(userId, true);
    startTransition(async () => {
      const result = await rejectMember(userId);
      mark(userId, false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success('가입 신청을 거절했어요.');
      setApplicants((prev) => prev.filter((a) => a.user_id !== userId));
      router.refresh();
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <UserPlus className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">가입 신청 ({applicants.length})</h2>
      </div>

      {applicants.length === 0 ? (
        <p className="text-sm text-muted-foreground">아직 신청이 없어요.</p>
      ) : (
        <ul className="space-y-2">
          {applicants.map((a) => {
            const isPending = pending.has(a.user_id);
            return (
              <li key={a.user_id} className="p-3 bg-muted/50 rounded-xl border border-border flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{a.display_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatMeetingDateTime(a.joined_at)}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleApprove(a.user_id)}
                  disabled={isPending}
                  className="gap-1"
                >
                  {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  승인
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleReject(a.user_id)}
                  disabled={isPending}
                  className="gap-1"
                >
                  <X className="w-3.5 h-3.5" />
                  거절
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
