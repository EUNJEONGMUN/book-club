import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export function MeetingBackLink({ fromHome, year, view }: { fromHome?: boolean; year?: number; view?: 'bookshelf' }) {
  const query = year === undefined ? undefined : view ? { year, view } : { year };
  const label = fromHome ? '홈으로' : view === 'bookshelf' ? '책 모아보기' : '모임목록';

  return (
    <Link
      href={fromHome ? '/' : { pathname: '/meetings', query }}
      className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-sm text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <ArrowLeft aria-hidden="true" className="size-3.5" />
      {label}
    </Link>
  );
}
