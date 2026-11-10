import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ user: vi.fn(), membership: vi.fn(), admin: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServer: async () => ({
  auth: { getUser: mocks.user },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.membership }) }) }),
}) }));
vi.mock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: mocks.admin }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => { throw new Error(`redirect:${path}`); },
  notFound: () => { throw new Error('not-found'); },
}));
import { requireMember, requireAdmin } from '@/lib/auth/membership';

describe('부글부글의 가입 상태와 접근 권한', () => {
  beforeEach(() => {
    mocks.user.mockResolvedValue({ data: { user: { id: 'user' } }, error: null });
    mocks.membership.mockResolvedValue({ data: { role: 'member' }, error: null });
  });
  it.each(['admin', 'member'])('%s는 모임을 이용할 수 있다', async role => {
    mocks.membership.mockResolvedValue({ data: { role }, error: null });
    expect((await requireMember()).role).toBe(role);
  });
  it('비로그인 사용자는 로그인으로 이동한다', async () => {
    mocks.user.mockResolvedValue({ data: { user: null }, error: null });
    await expect(requireMember()).rejects.toThrow('redirect:/login');
  });
  it('가입 전·탈퇴 상태는 가입 안내로 이동한다', async () => {
    mocks.membership.mockResolvedValue({ data: null, error: null });
    await expect(requireMember()).rejects.toThrow('redirect:/onboarding');
  });
  it('승인 대기자는 모임 대신 대기 화면으로 이동한다', async () => {
    mocks.membership.mockResolvedValue({ data: { role: 'pending' }, error: null });
    await expect(requireMember()).rejects.toThrow('redirect:/pending');
  });
  it('일반 멤버는 관리자 화면에 접근할 수 없다', async () => {
    await expect(requireAdmin()).rejects.toThrow('not-found');
  });
  it('조회 실패를 미가입 상태로 취급하지 않는다', async () => {
    mocks.membership.mockResolvedValue({ data: null, error: new Error('DB unavailable') });
    await expect(requireMember()).rejects.toThrow('DB unavailable');
  });
});
