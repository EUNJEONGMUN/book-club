import { beforeEach, expect, it, vi } from 'vitest';

const { rpc, revalidatePath } = vi.hoisted(() => ({
  rpc: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServer: async () => ({ rpc }),
}));
vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

import { rotateInvite, revokeInvite } from '@/lib/services/invites';

beforeEach(() => {
  vi.resetAllMocks();
});

it('rotate_invite 호출 결과의 토큰을 그대로 반환한다', async () => {
  rpc.mockResolvedValue({ data: 'new-token', error: null });

  await expect(rotateInvite()).resolves.toEqual({ ok: true, invite: { token: 'new-token' } });
  expect(rpc).toHaveBeenCalledWith('rotate_invite');
  expect(revalidatePath).toHaveBeenCalledWith('/more/info');
});

it('rotate_invite가 빈 응답을 돌려주면 실패로 처리한다', async () => {
  rpc.mockResolvedValue({ data: null, error: null });

  await expect(rotateInvite()).resolves.toMatchObject({ ok: false });
  expect(revalidatePath).not.toHaveBeenCalled();
});

it('revoke_invite 성공 후 설정 페이지를 재검증한다', async () => {
  rpc.mockResolvedValue({ data: null, error: null });

  await expect(revokeInvite()).resolves.toEqual({ ok: true });
  expect(rpc).toHaveBeenCalledWith('revoke_invite');
  expect(revalidatePath).toHaveBeenCalledWith('/more/info');
});

it('revoke_invite가 관리자 권한 오류를 안내 메시지로 바꾼다', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'Not admin' } });

  await expect(revokeInvite()).resolves.toMatchObject({
    ok: false,
    error: expect.stringContaining('관리자'),
  });
});
