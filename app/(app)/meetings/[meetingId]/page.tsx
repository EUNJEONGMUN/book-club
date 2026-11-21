import { requireMember } from '@/lib/auth/membership';
import { notFound } from 'next/navigation';
import { getMeetingDetail } from '@/lib/queries/meetings';
import { getCurrentProfile } from '@/lib/queries/members';
import { getMeetingDetailNavigation, type MeetingDetailSearchParams } from '@/lib/meeting-navigation';
import { canEditMeeting } from '@/lib/meeting-permissions';
import { getMeetingReviews } from '@/lib/queries/reviews';
import { getKoreanMeetingDateTime, hasMeetingStarted } from '@/lib/meeting-time';
import { getActiveMembers } from '@/lib/queries/club';
import { MeetingDetailHeader } from '@/components/meeting/MeetingDetailHeader';
import { ShareMeetingButton } from '@/components/meeting/ShareMeetingButton';
import { DiscussionQuestionList } from '@/components/meeting/DiscussionQuestionList';
import { DiscussionQuestionForm } from '@/components/meeting/DiscussionQuestionForm';
import { DiscussionFileUploader } from '@/components/meeting/DiscussionFileUploader';
import { MeetingReviews } from '@/components/meeting/MeetingReviews';
import { AttendanceSummary } from '@/components/meeting/AttendanceSummary';
import { AttendanceSection } from '@/components/meeting/AttendanceSection';

export default async function MeetingDetailPage({ params, searchParams }: {
  params: Promise<{ meetingId: string }>;
  searchParams: Promise<MeetingDetailSearchParams>;
}) {
  const [{ meetingId }, navigation] = await Promise.all([params, searchParams]);
  const { user, role: myRole } = await requireMember();
  const meeting = await getMeetingDetail(meetingId);
  if (!meeting) notFound();
  const me = await getCurrentProfile();
  const isCreator = user.id === meeting.created_by;
  const canEdit = canEditMeeting(meeting, user.id, myRole);
  const isAdmin = myRole === 'admin';
  const reviews = await getMeetingReviews(meeting.id);
  const isPastMeeting = hasMeetingStarted(meeting.scheduled_at);
  const listYear = isPastMeeting ? Number(getKoreanMeetingDateTime(meeting.scheduled_at).date.slice(0, 4)) : undefined;
  const { fromHome, bookshelfYear, search } = getMeetingDetailNavigation(navigation, listYear);

  const canEditAttendance = isPastMeeting && (isCreator || isAdmin);
  const eligibleMembers = canEditAttendance
    ? (await getActiveMembers()).map((m) => ({ user_id: m.user_id, display_name: m.display_name }))
    : [];

  return (
    <div className="space-y-6">
      <MeetingDetailHeader
        meeting={meeting}
        canEdit={canEdit}
        canDelete={isCreator}
        editHref={`/meetings/${meetingId}/edit${search}`}
        fromHome={fromHome}
        listYear={listYear}
        bookshelfYear={bookshelfYear}
      />
      <ShareMeetingButton />
      <section className="space-y-3">
        <p className="text-sm font-medium">발제 자료</p>
        {canEdit && (
          <DiscussionFileUploader
            meetingId={meeting.id}
            currentFileUrl={meeting.discussion_file_url ?? null}
            currentFileName={meeting.discussion_file_name ?? null}
          />
        )}
        {!canEdit && meeting.discussion_file_url && (() => {
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
              className="flex items-center gap-2 p-3 bg-muted/50 rounded-xl border border-border text-sm text-foreground hover:bg-muted transition-colors"
            >
              {isPdf ? '📄' : '🖼️'} {name}
            </a>
          );
        })()}
      </section>
      {/* 참석 현황: 미래 + 멤버는 토글+카운트 한 묶음(AttendanceSection),
          지난 모임은 보기 전용 (작성자·관리자는 수정 모드 진입 가능). */}
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
      <DiscussionQuestionList meetingId={meeting.id} questions={meeting.questions} canEdit={canEdit} />
      {canEdit && (
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
