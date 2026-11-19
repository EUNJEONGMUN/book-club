import { getKoreanMeetingDateTime, getKoreanMeetingDayDifference } from '@/lib/meeting-time';
import { bookshelfSearch } from '@/lib/meeting-navigation';
import { MeetingHeaderMenu } from './MeetingHeaderMenu';
import { MeetingsListLink } from './MeetingsListLink';
import { SeasonalIcon } from '@/components/theme/SeasonalIcon';
import type { Meeting, Profile } from '@/lib/types';

export function MeetingDetailHeader({
  meeting,
  canEdit,
  canDelete,
  listYear,
  bookshelfYear,
}: {
  meeting: Meeting & { host: Profile };
  canEdit: boolean;
  canDelete: boolean;
  listYear?: number;
  bookshelfYear?: number;
}) {
  const { date, time, weekday } = getKoreanMeetingDateTime(meeting.scheduled_at);
  const diff = getKoreanMeetingDayDifference(meeting.scheduled_at);
  const dDay = diff > 0 ? `D-${diff}` : diff === 0 ? 'D-Day' : null;

  return (
    <div className="space-y-2">
      <div className="-mt-2 flex items-center justify-between">
        <MeetingsListLink year={bookshelfYear ?? listYear} view={bookshelfYear === undefined ? undefined : 'bookshelf'} />
        <MeetingHeaderMenu
          meetingId={meeting.id}
          editHref={`/meetings/${meeting.id}/edit${bookshelfSearch(bookshelfYear)}`}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      </div>
      <div className="flex gap-3">
        <div data-slot="book-cover" className="w-20 h-28 bg-muted rounded shrink-0 flex items-center justify-center overflow-hidden">
          {meeting.book_cover_url ? (
            <img src={meeting.book_cover_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-3xl"><SeasonalIcon iconRole="book">📚</SeasonalIcon></span>
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-0.5">
          {dDay && (
            <p className="text-xs font-bold text-info-foreground">{dDay}</p>
          )}
          <h1 className="text-xl font-bold leading-tight">{meeting.book_title}</h1>
          <p className="text-sm text-muted-foreground">{meeting.book_author}</p>
          <p className="text-sm text-foreground pt-1">
            {date.replaceAll('-', '.')} ({weekday}) {time}
          </p>
          <p className="text-xs text-muted-foreground">발제자: {meeting.host.display_name}</p>
        </div>
      </div>
      <div className="bg-muted/50 p-3 rounded space-y-1">
        <p className="text-sm font-medium"><SeasonalIcon iconRole="location">📍</SeasonalIcon> {meeting.location_name}</p>
        {meeting.location_url && (
          <a
            href={meeting.location_url}
            target="_blank"
            rel="noreferrer"
            className="text-xs underline text-info-foreground"
          >
            장소 링크 열기
          </a>
        )}
      </div>
    </div>
  );
}
