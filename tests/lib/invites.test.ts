import { beforeEach, expect, it, vi } from 'vitest';

const { rpc, select, eq, single, revalidatePath } = vi.hoisted(() => ({
  rpc: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  single: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServer: async () => ({ rpc, from: () => ({ select }) }),
}));
vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

import { rotateInvite } from '@/lib/services/invites';

beforeEach(() => {
  vi.resetAllMocks();
  rpc.mockResolvedValue({ data: 'new-token', error: null });
  select.mockReturnValue({ eq });
  eq.mockReturnValue({ single });
});

it('발급된 토큰으로 DB의 정확한 만료 시각을 조회한다', async () => {
  const invite = { token: 'new-token', expires_at: '2026-12-02T18:25:43.987Z' };
  single.mockResolvedValue({ data: invite, error: null });

  await expect(rotateInvite()).resolves.toEqual({ ok: true, invite });
  expect(rpc).toHaveBeenCalledWith('rotate_invite');
  expect(eq).toHaveBeenCalledWith('token', 'new-token');
  expect(revalidatePath).toHaveBeenCalledWith('/more/info');
});

it('발급 후 만료 시각 조회가 실패하면 새로고침으로 결과를 확인하도록 안내한다', async () => {
  single.mockResolvedValue({ data: null, error: { message: 'lookup failed' } });

  await expect(rotateInvite()).resolves.toMatchObject({
    ok: false,
    error: expect.stringContaining('새로고침'),
  });
  expect(revalidatePath).toHaveBeenCalledWith('/more/info');
});
