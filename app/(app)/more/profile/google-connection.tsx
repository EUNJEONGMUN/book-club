'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { getSupabaseBrowser } from '@/lib/supabase/client';

const messages = {
  cancelled: 'Google 계정 연결이 취소됐어요.',
  conflict: '이 Google 계정은 이미 다른 부글부글 계정에 연결되어 있어요. 모임 관리자에게 문의해 주세요.',
  failed: 'Google 계정을 연결하지 못했어요. 다시 시도해 주세요.',
} as const;

export function GoogleConnection({
  email,
  hasGoogle,
  result,
}: {
  email?: string;
  hasGoogle: boolean;
  result?: string;
}) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<keyof typeof messages>();
  const callbackError = result === 'cancelled' || result === 'conflict' || result === 'failed'
    ? result
    : undefined;
  const issue = error ?? callbackError;

  async function connect() {
    setConnecting(true);
    setError(undefined);
    try {
      const callback = new URL('/auth/callback', window.location.origin);
      callback.searchParams.set('intent', 'link-google');
      const { error } = await getSupabaseBrowser().auth.linkIdentity({
        provider: 'google',
        options: { redirectTo: callback.toString(), queryParams: { prompt: 'select_account' } },
      });
      if (!error) return;
      setError(error.code === 'identity_already_exists' ? 'conflict' : 'failed');
    } catch {
      setError('failed');
    }
    setConnecting(false);
  }

  return (
    <section aria-labelledby="login-methods" className="space-y-3 border-t pt-4">
      <h2 id="login-methods" className="font-semibold">로그인 수단</h2>
      <dl className="space-y-2 text-sm">
        <div className="flex items-baseline justify-between gap-4">
          <dt>이메일 로그인</dt>
          <dd className="break-all">{email || '미등록'}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt>Google 로그인</dt>
          <dd>{hasGoogle ? '연결됨' : (
            <Button type="button" variant="outline" onClick={connect} disabled={connecting}>
              {connecting ? '연결 중…' : 'Google 계정 연결'}
            </Button>
          )}</dd>
        </div>
      </dl>
      {issue && !connecting && <p role="alert" className="text-sm text-red-700">{messages[issue]}</p>}
      {result === 'linked' && hasGoogle && <p role="status" className="text-sm">Google 계정을 연결했어요.</p>}
    </section>
  );
}
