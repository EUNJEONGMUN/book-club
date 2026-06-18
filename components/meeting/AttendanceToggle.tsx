'use client';

import type { AttendanceStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

const OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: 'attending', label: '참석' },
  { value: 'not_attending', label: '불참' },
  { value: 'undecided', label: '미정' },
];

/**
 * Controlled — 상태/액션 호출은 부모 (AttendanceSection)에서.
 * 이 컴포넌트는 prop status 강조 + onChange 콜백만.
 */
export function AttendanceToggle({
  status,
  onChange,
}: {
  status: AttendanceStatus | null;
  onChange: (s: AttendanceStatus) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">내 참석 여부</p>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
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
