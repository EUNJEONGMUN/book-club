import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ membership: vi.fn(), supabase: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => { throw new Error(path); },
}));
vi.mock('@/lib/auth/membership', () => ({ getMembership: mocks.membership }));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServer: mocks.supabase }));
vi.mock('@/app/(app)/join/JoinButton', () => ({ JoinButton: () => null }));

import JoinPage from '@/app/(app)/join/page';

beforeEach(() => vi.clearAllMocks());

it('링크가 없는 신규 사용자를 초대 안내로 보낸다', async () => {
  mocks.membership.mockResolvedValue({ role: null });
  await expect(JoinPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('/onboarding');
  expect(mocks.supabase).not.toHaveBeenCalled();
});

it.each([
  ['pending', '/pending'],
  ['member', '/'],
])('이미 %s 상태인 사용자는 예전 링크를 검증하지 않고 %s로 이동한다', async (role, target) => {
  mocks.membership.mockResolvedValue({ role });
  await expect(JoinPage({ searchParams: Promise.resolve({ token: 'old-invite' }) })).rejects.toThrow(new Error(target));
  expect(mocks.supabase).not.toHaveBeenCalled();
});
