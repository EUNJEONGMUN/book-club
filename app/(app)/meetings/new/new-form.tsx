'use client';

import { MeetingForm } from '@/components/meeting/MeetingForm';
import { createMeeting } from '@/lib/actions/meetings';

export function NewMeetingForm({ creatorId, members }: {
  creatorId: string;
  members: { user_id: string; display_name: string }[];
}) {
  const creator = members.find(({ user_id }) => user_id === creatorId);

  return (
    <MeetingForm
      defaultValues={{ host_id: creatorId }}
      presenterOptions={[
        { user_id: creatorId, display_name: creator ? `나(${creator.display_name})` : '나' },
        ...members.filter((member) => member.user_id !== creatorId),
      ]}
      onSubmit={createMeeting}
      submitLabel="등록하기"
      redirectOnSuccess={(id) => `/meetings/${id}`}
    />
  );
}
