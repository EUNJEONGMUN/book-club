import { requireMember } from '@/lib/auth/membership';
import Link from 'next/link';
import { getNextMeeting } from '@/lib/queries/club';
import { getCurrentProfile } from '@/lib/queries/members';
import { NextMeetingCard } from '@/components/meeting/NextMeetingCard';
import { buttonVariants } from '@/components/ui/button';
import { SeasonalDecoration } from '@/components/theme/SeasonalDecoration';
import { SeasonalIcon } from '@/components/theme/SeasonalIcon';

export default async function HomePage() {
  await requireMember();
  const [next, me] = await Promise.all([getNextMeeting(), getCurrentProfile()]);

  return (
    <div className="space-y-4">
      {me && (
        <div className="flex items-center justify-between gap-3">
          <h1 className="min-w-0 break-words text-xl font-bold">안녕하세요, {me.display_name}님</h1>
          <SeasonalDecoration decorationRole="home" />
        </div>
      )}
      {next && me ? (
        <NextMeetingCard meeting={next} viewerProfile={me} />
      ) : !next ? (
        <div className="text-center py-12 space-y-3 border-2 border-dashed rounded">
          <p className="text-3xl"><SeasonalIcon iconRole="book">📚</SeasonalIcon></p>
          <p className="text-muted-foreground">아직 예정된 모임이 없어요</p>
          <Link href="/meetings/new" className={buttonVariants()}>
            모임 만들기
          </Link>
        </div>
      ) : null}
    </div>
  );
}
