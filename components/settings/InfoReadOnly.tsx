import { Info } from 'lucide-react';
import type { ClubSettings } from '@/lib/types';

export function InfoReadOnly({ club }: { club: ClubSettings }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Info className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">모임 정보</h2>
      </div>
      <div className="space-y-1">
        <p className="text-base font-medium text-foreground">{club.name}</p>
        {club.description ? (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{club.description}</p>
        ) : (
          <p className="text-sm text-muted-foreground">아직 소개가 없어요.</p>
        )}
      </div>
    </section>
  );
}
