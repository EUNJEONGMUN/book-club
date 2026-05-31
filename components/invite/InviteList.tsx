'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Copy, Plus } from 'lucide-react';
import { createInvite } from '@/lib/actions/invite';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { Invite } from '@/lib/types';

export function InviteList({ initial, siteUrl }: { initial: Invite[]; siteUrl: string }) {
  const [invites, setInvites] = useState(initial);
  const [creating, setCreating] = useState(false);

  async function generate() {
    setCreating(true);
    const r = await createInvite();
    setCreating(false);
    if (!r.ok) return toast.error(r.error);
    const url = `${siteUrl}/signup?token=${r.token}`;
    await navigator.clipboard.writeText(url);
    toast.success('초대 링크가 복사되었습니다');
    setInvites((prev) => [
      {
        id: crypto.randomUUID(),
        token: r.token,
        created_by: '',
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        used_by: null,
        used_at: null,
      } as Invite,
      ...prev,
    ]);
  }

  function copy(token: string) {
    navigator.clipboard.writeText(`${siteUrl}/signup?token=${token}`);
    toast.success('복사됨');
  }

  function statusLabel(i: Invite): string {
    if (i.used_by) return '✓ 사용됨';
    if (new Date(i.expires_at) < new Date()) return '⏱ 만료';
    return '🟢 진행 중';
  }

  return (
    <div className="space-y-4">
      <Button onClick={generate} disabled={creating} className="w-full">
        <Plus className="w-4 h-4 mr-1" /> 새 초대 링크 생성
      </Button>

      <ul className="space-y-2">
        {invites.map((i) => {
          const active = !i.used_by && new Date(i.expires_at) > new Date();
          return (
            <Card key={i.id}>
              <CardContent className="p-3 flex justify-between items-center">
                <div className="min-w-0">
                  <p className="text-xs text-slate-500">{statusLabel(i)}</p>
                  <p className="text-sm font-mono truncate">{i.token.slice(0, 16)}...</p>
                </div>
                {active && (
                  <Button size="icon" variant="ghost" onClick={() => copy(i.token)}>
                    <Copy className="w-4 h-4" />
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
        {invites.length === 0 && (
          <p className="text-sm text-slate-500 text-center">아직 생성한 초대가 없습니다.</p>
        )}
      </ul>
    </div>
  );
}
