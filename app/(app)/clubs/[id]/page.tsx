import Link from 'next/link';
import { getNextMeetingInClub } from '@/lib/queries/clubs';
import { getCurrentProfile } from '@/lib/queries/members';
import { NextMeetingCard } from '@/components/meeting/NextMeetingCard';
import { Button } from '@/components/ui/button';

export default async function ClubHomePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: clubId } = await params;
  const [next, me] = await Promise.all([getNextMeetingInClub(clubId), getCurrentProfile()]);

  return (
    <div className="space-y-4">
      {me && <h1 className="text-xl font-bold">안녕하세요, {me.display_name}님</h1>}
      {next && me ? (
        <NextMeetingCard meeting={next} viewerProfile={me} />
      ) : !next ? (
        <div className="text-center py-12 space-y-3 border-2 border-dashed rounded">
          <p className="text-3xl">📚</p>
          <p className="text-slate-600">아직 예정된 모임이 없어요</p>
          <Link href={`/clubs/${clubId}/meetings/new`}>
            <Button>모임 만들기</Button>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
