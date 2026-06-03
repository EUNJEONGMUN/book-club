import { notFound } from 'next/navigation';
import { getMeetingDetail, getMyAttendance } from '@/lib/queries/meetings';
import { getCurrentProfile } from '@/lib/queries/members';
import { MeetingDetailHeader } from '@/components/meeting/MeetingDetailHeader';
import { MeetingActions } from '@/components/meeting/MeetingActions';
import { AttendanceToggle } from '@/components/meeting/AttendanceToggle';
import { AttendanceSummary } from '@/components/meeting/AttendanceSummary';
import { DiscussionQuestionList } from '@/components/meeting/DiscussionQuestionList';
import { DiscussionQuestionForm } from '@/components/meeting/DiscussionQuestionForm';
import { DiscussionFileUploader } from '@/components/meeting/DiscussionFileUploader';

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
      <section className="space-y-3">
        <p className="text-sm font-medium">발제 자료</p>
        {isHost && (
          <DiscussionFileUploader
            meetingId={meeting.id}
            currentFileUrl={(meeting as any).discussion_file_url ?? null}
          />
        )}
        {!isHost && (meeting as any).discussion_file_url && (
          <a
            href={(meeting as any).discussion_file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 p-3 bg-stone-50 rounded-xl border border-stone-200 text-sm text-stone-700 hover:bg-stone-100 transition-colors"
          >
            📄 발제 파일 열기
          </a>
        )}
      </section>
      <DiscussionQuestionList meetingId={meeting.id} questions={meeting.questions} isHost={isHost} />
      {isHost && (
        <DiscussionQuestionForm meetingId={meeting.id} questionsCount={meeting.questions.length} />
      )}
      {isHost && <MeetingActions meetingId={meeting.id} />}
    </div>
  );
}
