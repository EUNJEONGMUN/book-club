import { notFound } from 'next/navigation';
import { getMeetingDetail } from '@/lib/queries/meetings';
import { getCurrentProfile } from '@/lib/queries/members';
import { MeetingDetailHeader } from '@/components/meeting/MeetingDetailHeader';
import { MeetingActions } from '@/components/meeting/MeetingActions';

export default async function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meeting = await getMeetingDetail(id);
  if (!meeting) notFound();
  const me = await getCurrentProfile();
  const isHost = me?.id === meeting.host_id;

  return (
    <div className="space-y-6">
      <MeetingDetailHeader meeting={meeting} />
      {/* AttendanceToggle: Task 21 */}
      {/* AttendanceSummary: Task 22 */}
      {/* DiscussionQuestionList + Form: Task 23-24 */}
      {isHost && <MeetingActions meetingId={meeting.id} />}
    </div>
  );
}
