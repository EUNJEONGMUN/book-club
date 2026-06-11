'use client';

import { use } from 'react';
import { MeetingForm } from '@/components/meeting/MeetingForm';
import { createMeeting } from '@/lib/actions/meetings';

export default function ClubNewMeetingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: clubId } = use(params);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-stone-800">새 모임 등록</h1>
      <MeetingForm
        defaultValues={{ club_id: clubId }}
        onSubmit={(d) => createMeeting(d)}
        submitLabel="등록하기"
        redirectOnSuccess={(id) => `/clubs/${clubId}/meetings/${id}`}
      />
    </div>
  );
}
