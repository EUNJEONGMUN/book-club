'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, RefreshCw, Loader2, Key } from 'lucide-react';
import { rotateInvite } from '@/lib/actions/club';
import { Button } from '@/components/ui/button';
import type { Invite } from '@/lib/types';

const expiryFormatter = new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Seoul',
  hourCycle: 'h23',
});

export function InviteLinkPanel({
  initialInvite,
}: {
  initialInvite: Invite | null;
}) {
  const [invite, setInvite] = useState<Pick<Invite, 'token' | 'expires_at'> | null>(initialInvite);
  const [rotating, setRotating] = useState(false);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const invitePath = invite ? `/join?${new URLSearchParams({ token: invite.token })}` : null;

  async function handleRotate() {
    if (rotating) return;
    if (invite && !confirm('현재 초대링크가 무효화됩니다. 계속할까요?')) return;
    setRotating(true);
    try {
      const result = await rotateInvite();
      if (!result.ok) return toast.error(result.error);
      setInvite(result.invite);
      toast.success(invite ? '새 초대링크를 발급했어요.' : '초대링크를 만들었어요.');
    } catch {
      toast.error('초대링크 발급 결과를 확인하지 못했습니다. 새로고침해 확인해주세요.');
    } finally {
      setRotating(false);
    }
  }

  async function handleCopy() {
    if (!invitePath) return;
    try {
      await navigator.clipboard.writeText(new URL(invitePath, window.location.origin).href);
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

      {invite && invitePath ? (
        <div className="space-y-2">
          <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs text-stone-700 break-all">
            {origin + invitePath}
          </div>
          <p className="text-xs text-stone-500">
            만료: <time dateTime={invite.expires_at}>{expiryFormatter.format(new Date(invite.expires_at))}</time> (한국 시간)
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
