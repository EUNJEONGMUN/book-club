import Link from 'next/link';
import { getKoreanMeetingDateTime } from '@/lib/meeting-time';
import { Card, CardContent } from '@/components/ui/card';
import { SeasonalIcon } from '@/components/theme/SeasonalIcon';
import type { Meeting, Profile } from '@/lib/types';

export function MeetingCard({ meeting }: { meeting: Meeting & { host: Profile } }) {
  const { date, time, weekday } = getKoreanMeetingDateTime(meeting.scheduled_at);
  return (
    <Link href={`/meetings/${meeting.id}`} className="block">
      <Card className="hover:bg-muted/50 transition">
        <CardContent className="p-4 flex gap-3">
          <div data-slot="book-cover" className="w-16 h-20 bg-muted rounded shrink-0 flex items-center justify-center overflow-hidden">
            {meeting.book_cover_url
              ? <img src={meeting.book_cover_url} alt={meeting.book_title} className="w-full h-full object-cover" />
              : <span className="text-2xl"><SeasonalIcon iconRole="book">📚</SeasonalIcon></span>}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate">{meeting.book_title}</h3>
            <p className="text-sm text-muted-foreground truncate">{meeting.book_author}</p>
            <p className="text-xs text-muted-foreground mt-1">
              <time dateTime={meeting.scheduled_at}>{date.replaceAll('-', '.')} ({weekday}) {time}</time>
            </p>
            <p className="text-xs text-muted-foreground">발제자: {meeting.host.display_name}</p>
            <p className="text-xs text-muted-foreground truncate"><SeasonalIcon iconRole="location">📍</SeasonalIcon> {meeting.location_name}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
