import { Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { PendingClub } from '@/lib/queries/clubs';

export function PendingClubCard({ club }: { club: PendingClub }) {
  return (
    <Card className="bg-stone-50">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-stone-100 flex items-center justify-center text-2xl shrink-0 opacity-60">
          📚
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate text-stone-700">{club.name}</p>
          <p className="text-xs text-stone-500 truncate">관리자 승인 대기 중</p>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1 text-xs text-stone-500">
          <Clock className="w-3.5 h-3.5" />
          pending
        </span>
      </CardContent>
    </Card>
  );
}
