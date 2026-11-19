import Link from 'next/link';
import { SeasonalDecoration } from '@/components/theme/SeasonalDecoration';
import { MeetingsListLink } from '@/components/meeting/MeetingsListLink';
import { SeasonalIcon } from '@/components/theme/SeasonalIcon';
import { bookshelfSearch } from '@/lib/meeting-navigation';
import { getKoreanMeetingDateTime } from '@/lib/meeting-time';
import type { Meeting } from '@/lib/types';
import { cn } from '@/lib/utils';
import styles from './MeetingBookshelf.module.css';

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function MeetingBookshelf({ year, meetings }: { year: number; meetings: Meeting[] }) {
  const months = Array<Meeting | undefined>(12).fill(undefined);
  for (const meeting of meetings) {
    const month = Number(getKoreanMeetingDateTime(meeting.scheduled_at).date.slice(5, 7));
    const first = months[month - 1];
    if (!first || Date.parse(meeting.scheduled_at) < Date.parse(first.scheduled_at)) {
      months[month - 1] = meeting;
    }
  }

  return (
    <div data-slot="meeting-bookshelf" className={styles.board}>
      <div data-part="glints" className={styles.glints} aria-hidden="true">
        <span /><span /><span /><span /><span /><span />
      </div>
      <div className={styles.heading}>
        <div className={styles.back}><MeetingsListLink year={year} /></div>
        <h1 data-part="year" className={styles.year}>{year}</h1>
        <SeasonalDecoration decorationRole="bookshelf" className={styles.ornaments} />
      </div>
      <ol className={styles.months} aria-label="월별 함께 읽은 책">
        {months.map((book, index) => (
          <li key={monthNames[index]} data-part="month" className={styles.month}>
            {book ? (
              <Link
                href={`/meetings/${book.id}${bookshelfSearch(year)}`}
                aria-label={book.book_title}
                data-slot="book-cover"
                data-part="cover"
                className={cn(styles.cover, styles.book)}
              >
                {book.book_cover_url ? (
                  <img src={book.book_cover_url} alt="" />
                ) : (
                  <span aria-hidden="true" className="text-2xl"><SeasonalIcon iconRole="book">📚</SeasonalIcon></span>
                )}
              </Link>
            ) : (
              <div data-part="cover" className={styles.cover}>
                <span className="sr-only">아직 읽은 책 기록이 없습니다.</span>
              </div>
            )}
            <h2 data-part="month-name" className={styles.monthName} lang="en">{monthNames[index]}</h2>
          </li>
        ))}
      </ol>
    </div>
  );
}
