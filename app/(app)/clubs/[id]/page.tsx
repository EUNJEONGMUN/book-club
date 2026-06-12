import Link from 'next/link';
import { getNextMeetingInClub } from '@/lib/queries/clubs';
import { getCurrentProfile } from '@/lib/queries/members';
import { NextMeetingCard } from '@/components/meeting/NextMeetingCard';
import { Button } from '@/components/ui/button';
import { getSupabaseServer } from '@/lib/supabase/server';

async function getMyAttendance(meetingId: string, userId: string) {
  const supabase = await getSupabaseServer();
  const { data } = await supabase
    .from('attendances')
    .select('status')
    .eq('meeting_id', meetingId)
    .eq('user_id', userId)
    .maybeSingle();
  return data?.status ?? null;
}

export default async function ClubHomePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: clubId } = await params;
  const [next, me] = await Promise.all([getNextMeetingInClub(clubId), getCurrentProfile()]);
  const myStatus = next && me ? await getMyAttendance(next.id, me.id) : null;

  return (
    <div className="space-y-4">
      {me && <h1 className="text-xl font-bold">안녕하세요, {me.display_name}님</h1>}
      {next ? (
        <NextMeetingCard meeting={next} myStatus={myStatus} />
      ) : (
        <div className="text-center py-12 space-y-3 border-2 border-dashed rounded">
          <p className="text-3xl">📚</p>
          <p className="text-slate-600">아직 예정된 모임이 없어요</p>
          <Link href={`/clubs/${clubId}/meetings/new`}>
            <Button>첫 모임 만들기</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
