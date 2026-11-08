import { format, differenceInDays } from 'date-fns';
import { ko } from 'date-fns/locale';
import { MeetingHeaderMenu } from './MeetingHeaderMenu';
import type { Meeting, Profile } from '@/lib/types';

export function MeetingDetailHeader({
  meeting,
  isHost,
}: {
  meeting: Meeting & { host: Profile };
  isHost: boolean;
}) {
  const date = new Date(meeting.scheduled_at);
  const diff = differenceInDays(date, new Date());
  const isUpcoming = diff >= 0;
  const dDay = diff > 0 ? `D-${diff}` : 'D-Day';

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <div className="w-20 h-28 bg-slate-200 rounded shrink-0 flex items-center justify-center overflow-hidden">
          {meeting.book_cover_url ? (
            <img src={meeting.book_cover_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-3xl">📚</span>
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-0.5 relative">
          <div className="absolute top-0 right-0 z-10">
            <MeetingHeaderMenu meetingId={meeting.id} isHost={isHost} />
          </div>
          {isUpcoming && (
            <p className="text-xs font-bold text-blue-600">{dDay}</p>
          )}
          <h1 className="text-xl font-bold leading-tight pr-10">{meeting.book_title}</h1>
          <p className="text-sm text-slate-600">{meeting.book_author}</p>
          <p className="text-sm text-slate-700 pt-1">
            {format(date, 'yyyy.MM.dd (EEE) HH:mm', { locale: ko })}
          </p>
          <p className="text-xs text-slate-500">발제자: {meeting.host.display_name}</p>
        </div>
      </div>
      <div className="bg-slate-50 p-3 rounded space-y-1">
        <p className="text-sm font-medium">📍 {meeting.location_name}</p>
        {meeting.location_url && (
          <a
            href={meeting.location_url}
            target="_blank"
            rel="noreferrer"
            className="text-xs underline text-blue-600"
          >
            장소 링크 열기
          </a>
        )}
      </div>
    </div>
  );
}
