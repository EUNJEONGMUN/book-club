import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export function MeetingsListLink({ year }: { year?: number }) {
  return (
    <Link
      href={{ pathname: '/meetings', query: year === undefined ? undefined : { year } }}
      className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-sm text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <ArrowLeft aria-hidden="true" className="size-3.5" />
      모임목록
    </Link>
  );
}
