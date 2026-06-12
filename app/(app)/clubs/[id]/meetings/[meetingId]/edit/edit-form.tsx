'use client';

import { MeetingForm } from '@/components/meeting/MeetingForm';
import { updateMeeting } from '@/lib/actions/meetings';
import type { MeetingFormInput } from '@/lib/validation/meeting';

export function EditMeetingForm({
  id,
  clubId,
  defaults,
}: {
  id: string;
  clubId: string;
  defaults: MeetingFormInput;
}) {
  const detailHref = `/clubs/${clubId}/meetings/${id}`;
  return (
    <MeetingForm
      defaultValues={defaults}
      onSubmit={async (d) => {
        const r = await updateMeeting(id, d);
        return r.ok ? { ok: true } : { ok: false, error: r.error };
      }}
      submitLabel="저장"
      redirectOnSuccess={() => detailHref}
      cancelHref={detailHref}
    />
  );
}
