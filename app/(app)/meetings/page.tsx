import { requireMember } from '@/lib/auth/membership';
import Link from 'next/link';
import { BookOpen, Plus } from 'lucide-react';
import { getFirstPastMeetingDate, getUpcomingMeetings, getPastMeetings } from '@/lib/queries/club';
import { MeetingCard } from '@/components/meeting/MeetingCard';
import { MeetingBookshelf } from '@/components/meeting/MeetingBookshelf';
import { MeetingYearSelect } from '@/components/meeting/MeetingYearSelect';
import { buttonVariants } from '@/components/ui/button';
import { getKoreanMeetingDateTime } from '@/lib/meeting-time';
import { getBookshelfYear } from '@/lib/meeting-navigation';
import { cn } from '@/lib/utils';

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string | string[]; view?: string | string[] }>;
}) {
  await requireMember();
  const { year: requestedYear, view } = await searchParams;
  const showBookshelf = view === 'bookshelf';
  const now = new Date();
  const currentYear = Number(getKoreanMeetingDateTime(now).date.slice(0, 4));
  const [firstPastDate, upcoming] = await Promise.all([
    getFirstPastMeetingDate(now),
    showBookshelf ? [] : getUpcomingMeetings(now),
  ]);
  const firstYear = firstPastDate ? Number(getKoreanMeetingDateTime(firstPastDate).date.slice(0, 4)) : currentYear;
  const years = Array.from({ length: currentYear - firstYear + 1 }, (_, i) => currentYear - i);
  const bookshelfYear = getBookshelfYear({ view, year: requestedYear });
  const year = bookshelfYear !== undefined && bookshelfYear <= currentYear
    ? bookshelfYear
    : years.find((option) => String(option) === requestedYear) ?? currentYear;
  const past = await getPastMeetings(year, now);

  if (showBookshelf) return <MeetingBookshelf year={year} meetings={past} />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">모임</h1>
        <Link href={{ pathname: '/meetings/new', query: { year } }} className={buttonVariants({ className: 'min-h-11 gap-1' })}>
          <Plus aria-hidden="true" className="w-4 h-4" />
          신규 생성
        </Link>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">다가오는 모임</h2>
        {upcoming.length === 0 && <p className="text-sm text-muted-foreground">예정된 모임이 없습니다.</p>}
        {upcoming.map((m) => <MeetingCard key={m.id} meeting={m} />)}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">지난 모임</h2>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MeetingYearSelect year={year} years={years} />
            <span className="text-sm text-muted-foreground">{past.length}회</span>
          </div>
          <Link
            href={{ pathname: '/meetings', query: { year, view: 'bookshelf' } }}
            className={cn(buttonVariants({ variant: 'outline' }), 'min-h-11')}
          >
            <BookOpen aria-hidden="true" />
            모아보기
          </Link>
        </div>
        {past.length === 0 && <p className="text-sm text-muted-foreground">{year}년 지난 모임이 없습니다.</p>}
        {past.map((m) => <MeetingCard key={m.id} meeting={m} />)}
      </section>
    </div>
  );
}
