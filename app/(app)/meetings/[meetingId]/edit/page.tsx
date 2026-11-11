import { requireMember } from '@/lib/auth/membership';
import { notFound, redirect } from 'next/navigation';
import { getMeetingDetail } from '@/lib/queries/meetings';
import { getCurrentProfile } from '@/lib/queries/members';
import { EditMeetingForm } from './edit-form';

export default async function EditMeetingPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await params;
  await requireMember();
  const [meeting, me] = await Promise.all([getMeetingDetail(meetingId), getCurrentProfile()]);
  if (!meeting) notFound();
  if (me?.id !== meeting.host_id) redirect(`/meetings/${meetingId}`);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">모임 수정</h1>
      <EditMeetingForm
        id={meetingId}
        defaults={{
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
