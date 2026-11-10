'use client';

import { MeetingForm } from '@/components/meeting/MeetingForm';
import { createMeeting } from '@/lib/actions/meetings';

export default function NewMeetingPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-stone-800">새 모임 등록</h1>
      <MeetingForm
        onSubmit={(d) => createMeeting(d)}
        submitLabel="등록하기"
        redirectOnSuccess={(id) => `/meetings/${id}`}
      />
    </div>
  );
}
