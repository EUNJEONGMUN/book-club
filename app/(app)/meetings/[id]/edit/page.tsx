import { notFound, redirect } from 'next/navigation';
import { format } from 'date-fns';
import { getMeetingDetail } from '@/lib/queries/meetings';
import { getCurrentProfile } from '@/lib/queries/members';
import { EditMeetingForm } from './edit-form';

export default async function EditMeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [meeting, me] = await Promise.all([getMeetingDetail(id), getCurrentProfile()]);
  if (!meeting) notFound();
  if (me?.id !== meeting.host_id) redirect(`/meetings/${id}`);

  const localDate = format(new Date(meeting.scheduled_at), "yyyy-MM-dd'T'HH:mm");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">모임 수정</h1>
      <EditMeetingForm
        id={id}
        defaults={{
          club_id: meeting.club_id ?? '',
          book_title: meeting.book_title,
          book_author: meeting.book_author,
          book_cover_url: meeting.book_cover_url ?? '',
          scheduled_at: localDate,
          location_name: meeting.location_name,
          location_url: meeting.location_url ?? '',
          location_address: meeting.location_address ?? '',
        }}
      />
    </div>
  );
}
