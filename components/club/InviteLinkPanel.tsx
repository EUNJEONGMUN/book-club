'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Copy, RefreshCw, Loader2, Key } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { rotateInvite } from '@/lib/actions/club-invites';
import { Button } from '@/components/ui/button';
import type { ClubInvite } from '@/lib/types';

const INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30일 (rotate_invite SQL과 일치)

export function InviteLinkPanel({
  clubId,
  initialInvite,
}: {
  clubId: string;
  initialInvite: ClubInvite | null;
}) {
  const [invite, setInvite] = useState(initialInvite);
  const [rotating, setRotating] = useState(false);

  const fullUrl = invite
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/join?token=${invite.token}`
    : null;

  async function handleRotate() {
    if (rotating) return;
    if (invite && !confirm('현재 초대링크가 무효화됩니다. 계속할까요?')) return;
    setRotating(true);
    const result = await rotateInvite(clubId);
    setRotating(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(invite ? '새 초대링크를 발급했어요.' : '초대링크를 만들었어요.');
    // local state 즉시 반영 — router.refresh()로는 client useState가 안 갱신됨
    const now = Date.now();
    setInvite({
      id: '',
      club_id: clubId,
      token: result.token,
      created_by: '',
      created_at: new Date(now).toISOString(),
      expires_at: new Date(now + INVITE_TTL_MS).toISOString(),
      revoked_at: null,
    });
  }

  async function handleCopy() {
    if (!fullUrl) return;
    try {
      await navigator.clipboard.writeText(fullUrl);
      toast.success('초대링크가 복사됐어요.');
    } catch {
      toast.error('복사에 실패했어요. 직접 선택해서 복사해주세요.');
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Key className="w-4 h-4 text-stone-500" />
        <h2 className="text-sm font-semibold text-stone-700">초대링크</h2>
      </div>

      {invite && fullUrl ? (
        <div className="space-y-2">
          <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs text-stone-700 break-all">
            {fullUrl}
          </div>
          <p className="text-xs text-stone-500">
            만료: {format(new Date(invite.expires_at), 'yyyy-MM-dd HH:mm', { locale: ko })} (30일)
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleCopy} className="flex-1 gap-1">
              <Copy className="w-4 h-4" />
              복사
            </Button>
            <Button variant="outline" size="sm" onClick={handleRotate} disabled={rotating} className="flex-1 gap-1">
              {rotating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              재발급
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-stone-500">아직 발급된 초대링크가 없어요.</p>
          <Button onClick={handleRotate} disabled={rotating} className="gap-1">
            {rotating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
            초대링크 만들기
          </Button>
        </div>
      )}
    </section>
  );
}
