import Link from 'next/link';
import { Bell, Gift, TreePine } from 'lucide-react';
import { MeetingsListLink } from '@/components/meeting/MeetingsListLink';
import { SeasonalIcon } from '@/components/theme/SeasonalIcon';
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
    <div className={styles.board}>
      <div className={styles.glints} aria-hidden="true">
        <span /><span /><span /><span /><span /><span />
      </div>
      <div className={styles.heading}>
        <div className={styles.back}><MeetingsListLink year={year} /></div>
        <h1 className={styles.year}>{year}</h1>
        <div className={styles.ornaments} aria-hidden="true">
          <Gift />
          <TreePine />
          <Bell />
        </div>
      </div>
      <ol className={styles.months} aria-label="월별 함께 읽은 책">
        {months.map((book, index) => (
          <li key={monthNames[index]} className={styles.month}>
            {book ? (
              <Link
                href={`/meetings/${book.id}`}
                aria-label={book.book_title}
                className={cn('book-cover', styles.cover, styles.book)}
              >
                {book.book_cover_url ? (
                  <img src={book.book_cover_url} alt="" />
                ) : (
                  <span aria-hidden="true" className="text-2xl"><SeasonalIcon kind="book">📚</SeasonalIcon></span>
                )}
              </Link>
            ) : (
              <div className={styles.cover}>
                <span className="sr-only">아직 읽은 책 기록이 없습니다.</span>
              </div>
            )}
            <h2 className={styles.monthName} lang="en">{monthNames[index]}</h2>
          </li>
        ))}
      </ol>
    </div>
  );
}
