import Link from 'next/link';
import { differenceInDays } from 'date-fns';
import { getKoreanMeetingDateTime } from '@/lib/meeting-time';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AttendanceSection } from './AttendanceSection';
import type { Meeting, Profile, Attendance } from '@/lib/types';

type Props = {
  meeting: Meeting & {
    host: Profile;
    questions_count: number;
    attendances: Array<Attendance & { profile: Profile }>;
  };
  viewerProfile: Profile;
};

export function NextMeetingCard({ meeting, viewerProfile }: Props) {
  const { date, time, weekday } = getKoreanMeetingDateTime(meeting.scheduled_at);
  const [, month, day] = date.split('-');
  const diff = differenceInDays(new Date(meeting.scheduled_at), new Date());
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
              {month}월 {day}일 ({weekday}) {time}
            </p>
            <p className="text-xs text-slate-500">발제자: {meeting.host.display_name}</p>
            <p className="text-xs text-slate-500">📍 {meeting.location_name}</p>
          </div>
        </div>

        <AttendanceSection
          meetingId={meeting.id}
          initialAttendances={meeting.attendances}
          viewerProfile={viewerProfile}
        />

        <Link href={`/meetings/${meeting.id}`}>
          <Button variant="outline" className="w-full">
            상세 정보 →
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
