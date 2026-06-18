'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { setAttendance } from '@/lib/actions/attendance';
import type { AttendanceStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

const OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: 'attending', label: '참석' },
  { value: 'not_attending', label: '불참' },
  { value: 'undecided', label: '미정' },
];

export function AttendanceToggle({
  meetingId,
  initialStatus,
}: {
  meetingId: string;
  initialStatus: AttendanceStatus | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<AttendanceStatus | null>(initialStatus);
  const [, startTransition] = useTransition();

  function handle(s: AttendanceStatus) {
    const prev = status;
    setStatus(s);
    startTransition(async () => {
      const r = await setAttendance(meetingId, s);
      if (!r.ok) {
        setStatus(prev);
        toast.error(r.error);
        return;
      }
      // AttendanceSummary 카운트도 즉시 따라오도록 서버 컴포넌트 재렌더 트리거
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">내 참석 여부</p>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            onClick={() => handle(o.value)}
            className={cn(
              'py-3 rounded border text-sm font-medium transition',
              status === o.value
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
