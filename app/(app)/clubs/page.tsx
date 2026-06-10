import Link from 'next/link';
import { Plus } from 'lucide-react';
import { getMyClubs } from '@/lib/queries/clubs';
import { ClubCard } from '@/components/club/ClubCard';
import { Button } from '@/components/ui/button';

export default async function ClubsPage() {
  const clubs = await getMyClubs();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">내 그룹</h1>
        <Link href="/clubs/new">
          <Button size="sm" className="gap-1">
            <Plus className="w-4 h-4" />
            새 그룹
          </Button>
        </Link>
      </div>
      {clubs.length === 0 ? (
        <div className="text-center py-12 space-y-2 border-2 border-dashed rounded-xl">
          <p className="text-3xl">📚</p>
          <p className="text-sm text-stone-500">아직 속한 그룹이 없어요.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {clubs.map((club) => (
            <li key={club.id}>
              <ClubCard club={club} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
