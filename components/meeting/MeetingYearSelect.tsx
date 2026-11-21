'use client';

import { Select } from '@/components/ui/select';

import { useRouter } from 'next/navigation';

export function MeetingYearSelect({ year, years }: { year: number; years: number[] }) {
  const router = useRouter();

  return (
    <Select
      aria-label="지난 모임 연도"
      className="h-11 text-sm"
      value={year}
      onChange={(event) => router.push(`/meetings?year=${event.currentTarget.value}`, { scroll: false })}
    >
      {years.map((option) => <option key={option} value={option}>{option}년</option>)}
    </Select>
  );
}
