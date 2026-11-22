import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  member: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/lib/auth/membership', () => ({
  requireAdmin: mocks.admin, requireMember: mocks.member,
}));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServer: async () => ({ rpc: mocks.rpc, from: mocks.from }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

import { approveMember, rotateInvite } from '@/lib/actions/club';

describe('부글부글 관리 액션 가드', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('관리자 권한 검사가 실패하면 승인 작업은 실행하지 않는다', async () => {
    mocks.admin.mockRejectedValue(new Error('not-admin'));
    await expect(approveMember('applicant')).rejects.toThrow('not-admin');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('관리자 권한 검사가 실패하면 초대 발급도 실행하지 않는다', async () => {
    mocks.admin.mockRejectedValue(new Error('not-admin'));
    await expect(rotateInvite()).rejects.toThrow('not-admin');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
