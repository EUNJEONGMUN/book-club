import { requireMember } from '@/lib/auth/membership';
import { notFound, redirect } from 'next/navigation';
import { getMeetingDetail } from '@/lib/queries/meetings';
import { getActiveMembers } from '@/lib/queries/members';
import { getMeetingDetailNavigation, type MeetingDetailSearchParams } from '@/lib/meeting-navigation';
import { canEditMeeting } from '@/lib/meeting-permissions';
import { EditMeetingForm } from './edit-form';

export default async function EditMeetingPage({ params, searchParams }: {
  params: Promise<{ meetingId: string }>;
  searchParams: Promise<MeetingDetailSearchParams>;
}) {
  const [{ meetingId }, navigation] = await Promise.all([params, searchParams]);
  const { search } = getMeetingDetailNavigation(navigation);
  const detailHref = `/meetings/${meetingId}${search}`;
  const { user, role } = await requireMember();
  const meeting = await getMeetingDetail(meetingId);
  if (!meeting) notFound();
  if (!canEditMeeting(meeting, user.id, role)) redirect(detailHref);

  const members = await getActiveMembers();
  const presenters = members.map(({ user_id, display_name }) => ({
    user_id,
    display_name: user_id === user.id && user.id === meeting.created_by
      ? `나(${display_name})`
      : display_name,
  }));
  if (!presenters.some(({ user_id }) => user_id === meeting.host_id)) {
    presenters.unshift({ user_id: meeting.host_id, display_name: `${meeting.host.display_name} (기존 발제자)` });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">모임 수정</h1>
      <EditMeetingForm
        id={meetingId}
        detailHref={detailHref}
        presenters={presenters}
        defaults={{
          host_id: meeting.host_id,
          book_title: meeting.book_title,
          book_author: meeting.book_author,
          book_cover_url: meeting.book_cover_url ?? '',
          scheduled_at: meeting.scheduled_at,
          location_name: meeting.location_name,
          location_url: meeting.location_url ?? '',
          location_address: meeting.location_address ?? '',
        }}
      />
    </div>
  );
}
