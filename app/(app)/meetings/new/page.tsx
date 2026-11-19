import { requireMember } from '@/lib/auth/membership';
import { getActiveMembers } from '@/lib/queries/club';
import { NewMeetingForm } from './new-form';

export default async function NewMeetingPage() {
  const { user } = await requireMember();
  const members = await getActiveMembers();

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-foreground">새 모임 등록</h1>
      <NewMeetingForm
        creatorId={user.id}
        members={members.map(({ user_id, display_name }) => ({ user_id, display_name }))}
      />
    </div>
  );
}
