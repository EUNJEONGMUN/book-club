import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  admin: vi.fn(), member: vi.fn(), approve: vi.fn(), reject: vi.fn(), transfer: vi.fn(),
  leave: vi.fn(), apply: vi.fn(), rotate: vi.fn(), update: vi.fn(),
}));
vi.mock('@/lib/auth/membership', () => ({
  requireAdmin: mocks.admin, requireMember: mocks.member,
}));
vi.mock('@/lib/services/membership', () => ({
  approveMember: mocks.approve, rejectMember: mocks.reject, transferAdmin: mocks.transfer,
  leaveMembership: mocks.leave, applyForMembership: mocks.apply,
}));
vi.mock('@/lib/services/invites', () => ({ rotateInvite: mocks.rotate }));
vi.mock('@/lib/services/club-settings', () => ({ updateClubSettings: mocks.update }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { approveMember, updateClubSettings, applyForMembership } from '@/lib/actions/club';

describe('서버에서 부글부글을 지정하는 관리 기능', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.admin.mockResolvedValue({ role: 'admin' });
    mocks.update.mockResolvedValue({ ok: true });
    mocks.approve.mockResolvedValue({ ok: true });
  });
  it('가입 승인은 신청자 ID만 전달해 승인한다', async () => {
    await approveMember('applicant');
    expect(mocks.approve).toHaveBeenCalledWith('applicant');
  });
  it('관리자 권한 검사가 실패하면 승인 작업은 실행하지 않는다', async () => {
    mocks.admin.mockRejectedValue(new Error('not-admin'));
    await expect(approveMember('applicant')).rejects.toThrow('not-admin');
    expect(mocks.approve).not.toHaveBeenCalled();
  });
  it('수정 요청에 다른 그룹 ID를 끼워 넣어도 DB 요청에서는 제거한다', async () => {
    await updateClubSettings({ name: '부글부글', clubId: 'another-club' } as Parameters<typeof updateClubSettings>[0]);
    expect(mocks.update).toHaveBeenCalledWith({ name: '부글부글', description: undefined });
  });
  it('가입 신청은 초대코드만으로 단일 멤버십 신청을 검증한다', async () => {
    mocks.apply.mockResolvedValue({ ok: true, clubName: '부글부글' });
    expect(await applyForMembership('invite')).toEqual({ ok: true, clubName: '부글부글' });
    expect(mocks.apply).toHaveBeenCalledWith('invite');
  });
});
