import Link from 'next/link';
import { getNextMeeting, getMyAttendance } from '@/lib/queries/meetings';
import { getCurrentProfile } from '@/lib/queries/members';
import { NextMeetingCard } from '@/components/meeting/NextMeetingCard';
import { Button } from '@/components/ui/button';

export default async function HomePage() {
  const [next, me] = await Promise.all([getNextMeeting(), getCurrentProfile()]);
  const myStatus = next && me ? await getMyAttendance(next.id, me.id) : null;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">안녕하세요, {me?.display_name}님</h1>
      {next ? (
        <NextMeetingCard meeting={next} myStatus={myStatus} />
      ) : (
        <div className="text-center py-12 space-y-3 border-2 border-dashed rounded">
          <p className="text-3xl">📚</p>
          <p className="text-slate-600">아직 예정된 모임이 없어요</p>
          <Link href="/meetings/new"><Button>첫 모임 만들기</Button></Link>
        </div>
      )}
    </div>
  );
}
