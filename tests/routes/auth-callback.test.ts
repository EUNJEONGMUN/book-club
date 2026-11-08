import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ exchange: vi.fn(), server: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServer: mocks.server }));
import { GET } from '@/app/(auth)/auth/callback/route';

const origin = 'http://localhost:3000';
function request(params: Record<string, string>) {
  const url = new URL('/auth/callback', origin);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return new NextRequest(url);
}
function destination(response: Response) {
  return new URL(response.headers.get('location')!);
}

describe('OAuth 로그인 반환', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.server.mockResolvedValue({ auth: { exchangeCodeForSession: mocks.exchange } });
    mocks.exchange.mockResolvedValue({ error: null });
  });

  it('인증에 성공하면 원래 열려던 모임과 쿼리를 유지한다', async () => {
    const res = await GET(request({ code: 'local-code', next: '/meetings/original-id?tab=questions' }));
    expect(destination(res).href).toBe(origin + '/meetings/original-id?tab=questions');
    expect(mocks.exchange).toHaveBeenCalledWith('local-code');
  });

  it('코드 교환 실패는 로그인으로 돌려보내고 원래 목적지를 유지한다', async () => {
    mocks.exchange.mockResolvedValue({ error: new Error('private auth detail') });
    const url = destination(await GET(request({ code: 'expired', next: '/meetings/original-id' })));
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('error')).toBe('oauth_callback_failed');
    expect(url.searchParams.get('next')).toBe('/meetings/original-id');
    expect(url.href).not.toContain('private');
  });

  it('일시적인 인증 통신 예외도 비밀값을 노출하지 않고 재시도 안내로 연결한다', async () => {
    mocks.exchange.mockRejectedValue(new Error('private network detail'));
    const url = destination(await GET(request({ code: 'local-code' })));
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('error')).toBe('oauth_callback_failed');
  });

  it('계정 선택/동의 취소는 코드 교환 없이 로그인으로 연결한다', async () => {
    const url = destination(await GET(request({ error: 'access_denied', error_description: 'private provider detail', next: '/meetings/original-id' })));
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('error')).toBe('oauth_cancelled');
    expect(url.searchParams.get('next')).toBe('/meetings/original-id');
    expect(url.href).not.toContain('private');
    expect(mocks.server).not.toHaveBeenCalled();
  });

  it('인증 코드가 없는 요청을 로그인 성공으로 취급하지 않는다', async () => {
    const url = destination(await GET(request({ next: '/meetings/original-id' })));
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('error')).toBe('oauth_callback_failed');
    expect(mocks.server).not.toHaveBeenCalled();
  });

  it.each(['https://example.com', '//example.com', '/\\example.com', '/\t/example.com', '/\n/example.com'])('외부로 연결될 수 있는 목적지 %j를 거절한다', async next => {
    const url = destination(await GET(request({ code: 'local-code', next })));
    expect(url.origin).toBe(origin);
    expect(url.pathname).toBe('/');
  });
});
