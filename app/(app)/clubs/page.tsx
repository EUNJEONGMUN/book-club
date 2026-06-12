import Link from 'next/link';
import { Plus } from 'lucide-react';
import { getMyClubs, getMyPendingClubs } from '@/lib/queries/clubs';
import { ClubCard } from '@/components/club/ClubCard';
import { PendingClubCard } from '@/components/club/PendingClubCard';
import { Button } from '@/components/ui/button';

export default async function ClubsPage() {
  const [clubs, pending] = await Promise.all([getMyClubs(), getMyPendingClubs()]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">내 그룹</h1>
        <Link href="/clubs/new">
          <Button size="sm" className="gap-1">
            <Plus className="w-4 h-4" />
            새 그룹
          </Button>
        </Link>
      </div>

      {clubs.length === 0 && pending.length === 0 ? (
        <div className="text-center py-12 space-y-2 border-2 border-dashed rounded-xl">
          <p className="text-3xl">📚</p>
          <p className="text-sm text-stone-500">아직 속한 그룹이 없어요.</p>
        </div>
      ) : (
        <>
          {clubs.length > 0 && (
            <ul className="space-y-2">
              {clubs.map((club) => (
                <li key={club.id}>
                  <ClubCard club={club} />
                </li>
              ))}
            </ul>
          )}

          {pending.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-stone-600">승인 대기 중</h2>
              <ul className="space-y-2">
                {pending.map((club) => (
                  <li key={club.id}>
                    <PendingClubCard club={club} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
