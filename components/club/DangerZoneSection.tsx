'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2, LogOut, Loader2, AlertTriangle } from 'lucide-react';
import { leaveClub, deleteClub } from '@/lib/actions/club-members';
import { Button } from '@/components/ui/button';

export function DangerZoneSection({
  clubId,
  clubName,
  isAdmin,
}: {
  clubId: string;
  clubName: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleLeave() {
    if (busy) return;
    if (!confirm(`정말 "${clubName}"에서 탈퇴할까요? 이 그룹의 모임에 다시 참여하려면 새 초대링크가 필요해요.`)) return;
    setBusy(true);
    const result = await leaveClub(clubId);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('그룹을 탈퇴했어요.');
    router.push('/clubs');
    router.refresh();
  }

  async function handleDelete() {
    if (busy) return;
    const confirmed = prompt(
      `정말 "${clubName}"을(를) 삭제할까요? 모든 모임/참석/발제문이 함께 사라지고 복구할 수 없어요.\n\n계속하려면 그룹 이름을 정확히 입력해주세요:`
    );
    if (confirmed !== clubName) {
      if (confirmed !== null) toast.error('이름이 일치하지 않아 취소했어요.');
      return;
    }
    setBusy(true);
    const result = await deleteClub(clubId);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('그룹을 삭제했어요.');
    router.push('/clubs');
    router.refresh();
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-red-500" />
        <h2 className="text-sm font-semibold text-red-700">위험 영역</h2>
      </div>

      {isAdmin ? (
        <div className="space-y-2 p-3 border border-red-200 rounded-xl bg-red-50/30">
          <p className="text-sm text-stone-700">
            그룹 삭제는 되돌릴 수 없어요. 모든 모임/참석/발제문이 함께 삭제됩니다.
          </p>
          <Button
            onClick={handleDelete}
            disabled={busy}
            variant="destructive"
            className="gap-1"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            그룹 삭제
          </Button>
        </div>
      ) : (
        <div className="space-y-2 p-3 border border-stone-200 rounded-xl bg-stone-50">
          <p className="text-sm text-stone-700">
            탈퇴하면 이 그룹의 모임을 더 이상 볼 수 없어요. 다시 들어오려면 새 초대링크가 필요해요.
          </p>
          <Button
            onClick={handleLeave}
            disabled={busy}
            variant="outline"
            className="gap-1"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
            그룹 탈퇴
          </Button>
        </div>
      )}
    </section>
  );
}
