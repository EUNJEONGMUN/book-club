import { hasMeetingStarted } from '@/lib/meeting-time';

export function canEditMeeting(
  meeting: { created_by: string; scheduled_at: string },
  userId: string,
  role: 'admin' | 'member' | 'pending' | null,
) {
  return (role === 'admin' || role === 'member') && (
    meeting.created_by === userId ||
    (role === 'admin' && hasMeetingStarted(meeting.scheduled_at))
  );
}
