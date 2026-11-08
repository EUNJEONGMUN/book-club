'use client';

import { MeetingForm } from '@/components/meeting/MeetingForm';
import { updateMeeting } from '@/lib/actions/meetings';
import type { MeetingFormInput } from '@/lib/validation/meeting';

export function EditMeetingForm({
  id,
  defaults,
}: {
  id: string;
  defaults: MeetingFormInput;
}) {
  const detailHref = `/meetings/${id}`;
  return (
    <MeetingForm
      defaultValues={defaults}
      onSubmit={async (d) => {
        const r = await updateMeeting(id, d);
        return r.ok ? { ok: true, data: { id } } : { ok: false, error: r.error };
      }}
      submitLabel="저장"
      redirectOnSuccess={() => detailHref}
      cancelHref={detailHref}
    />
  );
}
