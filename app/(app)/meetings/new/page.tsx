import { requireMember } from '@/lib/auth/membership';
import { getActiveMembers } from '@/lib/queries/club';
import { NewMeetingForm } from './new-form';

export default async function NewMeetingPage({ searchParams }: {
  searchParams: Promise<{ from?: string | string[]; year?: string | string[] }>;
}) {
  const { user } = await requireMember();
  const [members, { from, year }] = await Promise.all([getActiveMembers(), searchParams]);
  let cancelHref = '/meetings';
  if (from === 'home') {
    cancelHref = '/';
  } else if (typeof year === 'string' && /^[1-9]\d{3}$/.test(year)) {
    cancelHref = `/meetings?year=${year}`;
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-foreground">새 모임 등록</h1>
      <NewMeetingForm
        creatorId={user.id}
        members={members.map(({ user_id, display_name }) => ({ user_id, display_name }))}
        cancelHref={cancelHref}
      />
    </div>
  );
}
