import Link from 'next/link';
import { format, differenceInDays } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AttendanceToggle } from './AttendanceToggle';
import type { Meeting, Profile, AttendanceStatus } from '@/lib/types';

type Props = {
  meeting: Meeting & { host: Profile; questions_count: number };
  myStatus: AttendanceStatus | null;
};

export function NextMeetingCard({ meeting, myStatus }: Props) {
  const date = new Date(meeting.scheduled_at);
  const diff = differenceInDays(date, new Date());
  const dDay = diff > 0 ? `D-${diff}` : diff === 0 ? 'D-Day' : `D+${-diff}`;

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex gap-3">
          <div className="w-20 h-28 bg-slate-200 rounded shrink-0 flex items-center justify-center overflow-hidden">
            {meeting.book_cover_url ? (
              <img src={meeting.book_cover_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-3xl">📚</span>
            )}
          </div>
          <div className="flex-1 space-y-1">
            <p className="text-xs font-bold text-blue-600">{dDay}</p>
            <h2 className="text-lg font-bold">{meeting.book_title}</h2>
            <p className="text-sm text-slate-600">{meeting.book_author}</p>
            <p className="text-sm text-slate-700 mt-1">
              {format(date, 'MM월 dd일 (EEE) HH:mm', { locale: ko })}
            </p>
            <p className="text-xs text-slate-500">📍 {meeting.location_name}</p>
          </div>
        </div>

        <AttendanceToggle meetingId={meeting.id} initialStatus={myStatus} />

        <Link href={`/meetings/${meeting.id}`}>
          <Button variant="outline" className="w-full">
            발제문 {meeting.questions_count}개 보기 →
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
