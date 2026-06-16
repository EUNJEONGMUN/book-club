import { notFound } from 'next/navigation';
import { getMeetingDetail, getMyAttendance } from '@/lib/queries/meetings';
import { getCurrentProfile } from '@/lib/queries/members';
import { getMeetingReviews } from '@/lib/queries/reviews';
import { getSupabaseServer } from '@/lib/supabase/server';
import { MeetingDetailHeader } from '@/components/meeting/MeetingDetailHeader';
import { DiscussionQuestionList } from '@/components/meeting/DiscussionQuestionList';
import { DiscussionQuestionForm } from '@/components/meeting/DiscussionQuestionForm';
import { DiscussionFileUploader } from '@/components/meeting/DiscussionFileUploader';
import { MeetingReviews } from '@/components/meeting/MeetingReviews';
import { AttendanceSummary } from '@/components/meeting/AttendanceSummary';
import { AttendanceToggle } from '@/components/meeting/AttendanceToggle';

async function getMyRole(clubId: string): Promise<'admin' | 'member' | null> {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('club_members')
    .select('role')
    .eq('club_id', clubId)
    .eq('user_id', user.id)
    .maybeSingle();
  const role = data?.role;
  return role === 'admin' || role === 'member' ? role : null;
}

export default async function MeetingDetailPage({ params }: { params: Promise<{ id: string; meetingId: string }> }) {
  const { id: clubId, meetingId } = await params;
  const meeting = await getMeetingDetail(meetingId);
  if (!meeting) notFound();
  if (meeting.club_id !== clubId) notFound();
  const me = await getCurrentProfile();
  const isHost = me?.id === meeting.host_id;
  const myRole = await getMyRole(clubId);
  const isAdmin = myRole === 'admin';
  const reviews = await getMeetingReviews(meeting.id);
  const isPastMeeting = new Date(meeting.scheduled_at) <= new Date();
  const myStatus = me ? await getMyAttendance(meeting.id, me.id) : null;

  // 지난 모임이면 host/admin만 정정 가능 (멤버 옆 inline 버튼)
  const canEditAttendance = isPastMeeting && (isHost || isAdmin);

  return (
    <div className="space-y-6">
      <MeetingDetailHeader meeting={meeting} isHost={isHost} />
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
      {/* 참석 현황: 항상 표시. 미래 모임이면 본인 토글, 지난 모임 + host/admin은 정정 모드 */}
      {!isPastMeeting && myRole && (
        <AttendanceToggle meetingId={meeting.id} initialStatus={myStatus} />
      )}
      <AttendanceSummary
        meetingId={meeting.id}
        attendances={meeting.attendances}
        canEdit={canEditAttendance}
      />
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
