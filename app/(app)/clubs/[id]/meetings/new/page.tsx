import { redirect } from 'next/navigation';
import { MeetingForm } from '@/components/meeting/MeetingForm';
import { createMeeting } from '@/lib/actions/meetings';
import { getCurrentProfile } from '@/lib/queries/members';

export default async function ClubNewMeetingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: clubId } = await params;
  const me = await getCurrentProfile();

  if (!me) {
    redirect('/login');
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-stone-800">새 모임 등록</h1>
      <MeetingForm
        onSubmit={(d) => createMeeting({ ...d, club_id: clubId })}
        submitLabel="등록하기"
        redirectOnSuccess={(id) => `/meetings/${id}`}
      />
    </div>
  );
}
