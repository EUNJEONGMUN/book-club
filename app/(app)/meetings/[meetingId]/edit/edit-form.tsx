'use client';

import { MeetingForm } from '@/components/meeting/MeetingForm';
import { updateMeeting } from '@/lib/actions/meetings';
import type { MeetingFormInput } from '@/lib/validation/meeting';

export function EditMeetingForm({
  id,
  detailHref,
  defaults,
  presenters,
}: {
  id: string;
  detailHref: string;
  defaults: MeetingFormInput;
  presenters: { user_id: string; display_name: string }[];
}) {
  return (
    <MeetingForm
      defaultValues={defaults}
      presenterOptions={presenters}
      onSubmit={async (d) => {
        const { host_id, ...details } = d;
        const r = await updateMeeting(id, host_id === defaults.host_id ? details : d);
        return r.ok ? { ok: true, data: { id } } : { ok: false, error: r.error };
      }}
      submitLabel="저장"
      redirectOnSuccess={() => detailHref}
      cancelHref={detailHref}
    />
  );
}
