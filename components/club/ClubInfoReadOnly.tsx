import { Info } from 'lucide-react';
import type { Club } from '@/lib/types';

export function ClubInfoReadOnly({ club }: { club: Club }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Info className="w-4 h-4 text-stone-500" />
        <h2 className="text-sm font-semibold text-stone-700">그룹 정보</h2>
      </div>
      <div className="space-y-1">
        <p className="text-base font-medium text-stone-800">{club.name}</p>
        {club.description ? (
          <p className="text-sm text-stone-600 whitespace-pre-wrap">{club.description}</p>
        ) : (
          <p className="text-sm text-stone-400">아직 소개가 없어요.</p>
        )}
      </div>
    </section>
  );
}
