'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Trash2, Loader2, Key } from 'lucide-react';
import { rotateInvite, revokeInvite } from '@/lib/actions/club';
import { Button } from '@/components/ui/button';
import type { Invite } from '@/lib/types';

export function InviteLinkPanel({
  initialInvite,
}: {
  initialInvite: Invite | null;
}) {
  const [invite, setInvite] = useState<{ token: string } | null>(initialInvite);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const invitePath = invite ? `/join?${new URLSearchParams({ token: invite.token })}` : null;

  async function handleCreate() {
    if (creating) return;
    setCreating(true);
    try {
      const result = await rotateInvite();
      if (!result.ok) return toast.error(result.error);
      setInvite(result.invite);
      toast.success('초대링크를 만들었어요.');
    } catch {
      toast.error('초대링크 발급 결과를 확인하지 못했습니다. 새로고침해 확인해주세요.');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke() {
    if (revoking) return;
    if (!confirm('현재 초대링크가 폐기됩니다. 계속할까요?')) return;
    setRevoking(true);
    try {
      const result = await revokeInvite();
      if (!result.ok) return toast.error(result.error);
      setInvite(null);
      toast.success('초대링크를 폐기했어요.');
    } catch {
      toast.error('초대링크 폐기 결과를 확인하지 못했습니다. 새로고침해 확인해주세요.');
    } finally {
      setRevoking(false);
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
        <Key className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">초대링크</h2>
      </div>

      {invite && invitePath ? (
        <div className="space-y-2">
          <div className="p-3 bg-muted/50 rounded-xl border border-border text-xs text-foreground break-all">
            {origin + invitePath}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleCopy} className="flex-1 gap-1">
              <Copy className="w-4 h-4" />
              복사
            </Button>
            <Button variant="outline" size="sm" onClick={handleRevoke} disabled={revoking} className="flex-1 gap-1">
              {revoking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              폐기
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">아직 발급된 초대링크가 없어요.</p>
          <Button onClick={handleCreate} disabled={creating} className="gap-1">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
            초대링크 만들기
          </Button>
        </div>
      )}
    </section>
  );
}
