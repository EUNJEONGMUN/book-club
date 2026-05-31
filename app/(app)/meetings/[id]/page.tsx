import { notFound } from 'next/navigation';
import { getMeetingDetail, getMyAttendance } from '@/lib/queries/meetings';
import { getCurrentProfile } from '@/lib/queries/members';
import { MeetingDetailHeader } from '@/components/meeting/MeetingDetailHeader';
import { MeetingActions } from '@/components/meeting/MeetingActions';
import { AttendanceToggle } from '@/components/meeting/AttendanceToggle';
import { AttendanceSummary } from '@/components/meeting/AttendanceSummary';

export default async function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meeting = await getMeetingDetail(id);
  if (!meeting) notFound();
  const me = await getCurrentProfile();
  const isHost = me?.id === meeting.host_id;
  const myStatus = me ? await getMyAttendance(meeting.id, me.id) : null;

  return (
    <div className="space-y-6">
      <MeetingDetailHeader meeting={meeting} />
      <AttendanceToggle meetingId={meeting.id} initialStatus={myStatus} />
      <AttendanceSummary attendances={meeting.attendances} />
      {/* DiscussionQuestionList + Form: Task 23-24 */}
      {isHost && <MeetingActions meetingId={meeting.id} />}
    </div>
  );
}
