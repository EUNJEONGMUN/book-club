// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/ssr', () => ({ createServerClient: createClient }));
import { maintenanceResponse } from '@/lib/maintenance';
import { updateSession } from '@/lib/supabase/middleware';
import { config } from '../../middleware';

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe('인증 미들웨어 경로', () => {
  it.each(['/monitoring?o=123&p=456&r=us', '/monitoring/'])('Sentry 터널을 통과시킨다 (%s)', (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false);
  });

  it.each(['/meetings', '/monitoring-settings', '/monitoring/private'])('다른 경로에는 미들웨어를 적용한다 (%s)', (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
  });
});

describe('운영 전환용 앱 점검 응답', () => {
  it('평상시에는 기존 인증 흐름을 방해하지 않는다', () => {
    vi.stubEnv('MAINTENANCE_MODE', '0');
    expect(maintenanceResponse(new NextRequest('http://localhost:3000/'))).toBeNull();
  });
  it('점검 중 페이지는 캐시되지 않는 503 안내를 제공한다', async () => {
    vi.stubEnv('MAINTENANCE_MODE', '1');
    const response = maintenanceResponse(new NextRequest('http://localhost:3000/'))!;
    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(await response.text()).toContain('기존 기록을 안전하게 보존');
  });
  it.each([['GET','/api/preflight'],['POST','/meetings'],['POST','/more']])('%s %s 요청도 중단한다', async (method, pathname) => {
    vi.stubEnv('MAINTENANCE_MODE', '1');
    const response = maintenanceResponse(new NextRequest(`http://localhost:3000${pathname}`, { method }))!;
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain('점검');
  });
  it('새 스키마를 적용하기 전에도 DB 접속보다 먼저 요청을 차단한다', async () => {
    vi.stubEnv('MAINTENANCE_MODE', '1');
    expect((await updateSession(new NextRequest('http://localhost:3000/'))).status).toBe(503);
    expect(createClient).not.toHaveBeenCalled();
  });
});
