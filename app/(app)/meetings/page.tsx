import Link from 'next/link';
import { Plus } from 'lucide-react';
import { getUpcomingMeetings, getPastMeetings } from '@/lib/queries/meetings';
import { MeetingCard } from '@/components/meeting/MeetingCard';
import { Button } from '@/components/ui/button';

export default async function MeetingsPage() {
  const [upcoming, past] = await Promise.all([getUpcomingMeetings(), getPastMeetings()]);
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">모임</h1>
        <Link href="/meetings/new">
          <Button size="icon"><Plus className="w-4 h-4" /></Button>
        </Link>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-700">다가오는 모임</h2>
        {upcoming.length === 0 && <p className="text-sm text-slate-500">예정된 모임이 없습니다.</p>}
        {upcoming.map((m) => <MeetingCard key={m.id} meeting={m} />)}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-700">지난 모임</h2>
        {past.length === 0 && <p className="text-sm text-slate-500">아직 지난 모임이 없습니다.</p>}
        {past.map((m) => <MeetingCard key={m.id} meeting={m} />)}
      </section>
    </div>
  );
}
