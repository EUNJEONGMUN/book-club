import { requireMember } from '@/lib/auth/membership';
import { notFound } from 'next/navigation';
import { getMeetingDetail } from '@/lib/queries/meetings';
import { getCurrentProfile } from '@/lib/queries/members';
import { getMeetingReviews } from '@/lib/queries/reviews';
import { getActiveMembers } from '@/lib/queries/club';
import { MeetingDetailHeader } from '@/components/meeting/MeetingDetailHeader';
import { ShareMeetingButton } from '@/components/meeting/ShareMeetingButton';
import { ShareMeetingImageButton } from '@/components/meeting/ShareMeetingImageButton';
import { DiscussionQuestionList } from '@/components/meeting/DiscussionQuestionList';
import { DiscussionQuestionForm } from '@/components/meeting/DiscussionQuestionForm';
import { DiscussionFileUploader } from '@/components/meeting/DiscussionFileUploader';
import { MeetingReviews } from '@/components/meeting/MeetingReviews';
import { AttendanceSummary } from '@/components/meeting/AttendanceSummary';
import { AttendanceSection } from '@/components/meeting/AttendanceSection';

export default async function MeetingDetailPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await params;
  const { role: myRole } = await requireMember();
  const meeting = await getMeetingDetail(meetingId);
  if (!meeting) notFound();
  const me = await getCurrentProfile();
  const isHost = me?.id === meeting.host_id;
  const isAdmin = myRole === 'admin';
  const reviews = await getMeetingReviews(meeting.id);
  const isPastMeeting = new Date(meeting.scheduled_at) <= new Date();

  // 지난 모임이면 host/admin만 정정 가능 (수정 모드)
  const canEditAttendance = isPastMeeting && (isHost || isAdmin);
  // 수정 모드 추가하기 picker용 — host/admin 정정 권한자만 필요
  const eligibleMembers = canEditAttendance
    ? (await getActiveMembers()).map((m) => ({ user_id: m.user_id, display_name: m.display_name }))
    : [];

  return (
    <div className="space-y-6">
      <MeetingDetailHeader meeting={meeting} isHost={isHost} />
      <ShareMeetingButton />
      <ShareMeetingImageButton meetingId={meeting.id} />
      <section className="space-y-3">
        <p className="text-sm font-medium">발제 자료</p>
        {isHost && (
          <DiscussionFileUploader
            meetingId={meeting.id}
            currentFileUrl={meeting.discussion_file_url ?? null}
            currentFileName={meeting.discussion_file_name ?? null}
          />
        )}
        {!isHost && meeting.discussion_file_url && (() => {
          const url = meeting.discussion_file_url;
          const storedName = meeting.discussion_file_name;
          const isPdf = /\.pdf(\?|$)/i.test(url);
          let fallback = '';
          try {
            fallback = decodeURIComponent(url.split('/').pop()?.split('?')[0] ?? '');
          } catch {
            fallback = url.split('/').pop()?.split('?')[0] ?? '';
          }
          const name = storedName || fallback || '발제 파일';
          const downloadUrl = storedName ? `${url}?download=${encodeURIComponent(storedName)}` : url;
          return (
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-3 bg-stone-50 rounded-xl border border-stone-200 text-sm text-stone-700 hover:bg-stone-100 transition-colors"
            >
              {isPdf ? '📄' : '🖼️'} {name}
            </a>
          );
        })()}
      </section>
      {/* 참석 현황: 미래 + 멤버는 토글+카운트 한 묶음(AttendanceSection),
          지난 모임은 보기 전용 (host/admin은 수정 모드 진입 가능). */}
      {!isPastMeeting && myRole && me ? (
        <AttendanceSection
          meetingId={meeting.id}
          initialAttendances={meeting.attendances}
          viewerProfile={me}
        />
      ) : (
        <AttendanceSummary
          meetingId={meeting.id}
          attendances={meeting.attendances}
          eligibleMembers={eligibleMembers}
          canEdit={canEditAttendance}
        />
      )}
      <DiscussionQuestionList meetingId={meeting.id} questions={meeting.questions} isHost={isHost} />
      {isHost && (
        <DiscussionQuestionForm meetingId={meeting.id} />
      )}
      <MeetingReviews
        meetingId={meeting.id}
        initialOwn={reviews.own}
        others={reviews.others}
        isPastMeeting={isPastMeeting}
      />
    </div>
  );
}
