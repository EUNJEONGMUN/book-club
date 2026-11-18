'use client';

import { useRouter } from 'next/navigation';

export function MeetingYearSelect({ year, years }: { year: number; years: number[] }) {
  const router = useRouter();

  return (
    <select
      aria-label="지난 모임 연도"
      className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm"
      value={year}
      onChange={(event) => router.push(`/meetings?year=${event.currentTarget.value}`, { scroll: false })}
    >
      {years.map((option) => <option key={option} value={option}>{option}년</option>)}
    </select>
  );
}
