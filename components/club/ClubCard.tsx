import Link from 'next/link';
import { Crown, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { MyClub } from '@/lib/queries/clubs';

export function ClubCard({ club }: { club: MyClub }) {
  return (
    <Link href={`/clubs/${club.id}`} className="block">
      <Card className="hover:bg-stone-50 transition-colors">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-stone-100 flex items-center justify-center text-2xl shrink-0">
            📚
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{club.name}</p>
            {club.description && (
              <p className="text-sm text-stone-500 truncate">{club.description}</p>
            )}
          </div>
          <span className="shrink-0 inline-flex items-center gap-1 text-xs text-stone-500">
            {club.role === 'admin' ? (
              <><Crown className="w-3.5 h-3.5" />admin</>
            ) : (
              <><Users className="w-3.5 h-3.5" />member</>
            )}
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
