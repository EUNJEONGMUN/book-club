'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Crown, Loader2 } from 'lucide-react';
import { transferAdmin } from '@/lib/actions/club-members';
import { Button } from '@/components/ui/button';
import type { ClubActiveMember } from '@/lib/queries/clubs';

export function AdminTransferSection({
  clubId,
  activeMembers,
  currentUserId,
}: {
  clubId: string;
  activeMembers: ClubActiveMember[];
  currentUserId: string;
}) {
  const router = useRouter();
  const others = activeMembers.filter((m) => m.user_id !== currentUserId);
  const [selected, setSelected] = useState<string>('');
  const [transferring, setTransferring] = useState(false);

  async function handleTransfer() {
    if (!selected || transferring) return;
    const target = others.find((m) => m.user_id === selected);
    if (!target) return;
    if (!confirm(`${target.display_name} 님에게 관리자 권한을 이양할까요? 이양 후엔 본인이 일반 멤버가 됩니다.`)) return;
    setTransferring(true);
    const result = await transferAdmin(clubId, selected);
    setTransferring(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('관리자 권한을 이양했어요.');
    router.refresh();
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Crown className="w-4 h-4 text-stone-500" />
        <h2 className="text-sm font-semibold text-stone-700">관리자 이양</h2>
      </div>

      {others.length === 0 ? (
        <p className="text-sm text-stone-500">이양할 다른 멤버가 없어요.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-stone-500">새 관리자를 선택하면 본인은 일반 멤버가 됩니다.</p>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="block w-full bg-stone-50 border border-stone-200 rounded-md px-3 py-2 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-stone-300"
          >
            <option value="">멤버 선택</option>
            {others.map((m) => (
              <option key={m.user_id} value={m.user_id}>{m.display_name}</option>
            ))}
          </select>
          <Button
            onClick={handleTransfer}
            disabled={!selected || transferring}
            variant="outline"
            className="gap-1"
          >
            {transferring ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
            이양하기
          </Button>
        </div>
      )}
    </section>
  );
}
