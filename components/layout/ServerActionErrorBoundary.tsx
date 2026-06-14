'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';

// 패턴은 instrumentation-client.ts의 Sentry filter와 의미적으로 같음.
// 둘 다 동일하게 "사용자측 네트워크 일순 끊김으로 인한 server action fetch 실패"를 가리킴.
const NETWORK_FETCH_PATTERN = /Load failed|Failed to fetch|NetworkError/i;
const SERVER_ACTION_STACK_PATTERN = /fetchServerAction|server-action-reducer/;

function isServerActionNetworkError(reason: unknown): boolean {
  if (!(reason instanceof Error)) return false;
  if (!NETWORK_FETCH_PATTERN.test(reason.message)) return false;
  return SERVER_ACTION_STACK_PATTERN.test(reason.stack ?? '');
}

/**
 * Next.js server action POST이 사용자 네트워크 문제로 실패하면 우리 호출처의
 * try/catch를 거치지 않고 unhandled promise rejection으로 window까지 올라옴.
 * 사용자 입장에서는 버튼 눌렀는데 아무 반응 없음 → 혼란. 여기서 catch해서 토스트.
 */
export function ServerActionErrorBoundary() {
  useEffect(() => {
    function handler(e: PromiseRejectionEvent) {
      if (!isServerActionNetworkError(e.reason)) return;
      e.preventDefault(); // 콘솔에 unhandled rejection 로그 안 남기게
      toast.error('네트워크 연결이 불안정해요. 다시 시도해주세요.');
    }
    window.addEventListener('unhandledrejection', handler);
    return () => window.removeEventListener('unhandledrejection', handler);
  }, []);
  return null;
}
