import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  requireMember: vi.fn(),
  getClubSettings: vi.fn(),
  getCurrentProfile: vi.fn(),
  getPendingApplicants: vi.fn(),
  getActiveInvite: vi.fn(),
  getActiveMembers: vi.fn(),
}));
vi.mock('@/lib/auth/membership', () => ({ requireMember: mocks.requireMember }));
vi.mock('@/lib/queries/club', () => mocks);
vi.mock('@/lib/queries/members', () => ({ getCurrentProfile: mocks.getCurrentProfile }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('notFound'); } }));
vi.mock('@/app/(app)/more/logout-button', () => ({ LogoutButton: () => <button>로그아웃</button> }));
vi.mock('@/components/club/ClubInfoPanel', () => ({ ClubInfoPanel: () => <div>모임 수정</div> }));
vi.mock('@/components/club/ClubInfoReadOnly', () => ({ ClubInfoReadOnly: () => <div>모임 소개</div> }));
vi.mock('@/components/club/InviteLinkPanel', () => ({ InviteLinkPanel: () => <div>초대링크</div> }));
vi.mock('@/components/club/AdminTransferSection', () => ({ AdminTransferSection: () => <div>관리자 이양</div> }));
vi.mock('@/components/club/DangerZoneSection', () => ({ DangerZoneSection: () => <div>모임 탈퇴</div> }));

import SettingsPage from '@/app/(app)/more/page';
import GroupSettingsPage from '@/app/(app)/more/info/page';

describe('설정 화면 권한별 동선', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireMember.mockResolvedValue({ role: 'admin', user: { id: 'user-1' } });
    mocks.getClubSettings.mockResolvedValue({ name: '부글부글', description: '함께 책 읽는 사람들' });
    mocks.getCurrentProfile.mockResolvedValue({ display_name: '문은정', avatar_url: null });
    mocks.getPendingApplicants.mockResolvedValue([{ user_id: 'pending-1' }]);
    mocks.getActiveInvite.mockResolvedValue(null);
    mocks.getActiveMembers.mockResolvedValue([]);
  });

  it('관리자는 프로필, 그룹 설정과 실제 가입 신청자 수를 본다', async () => {
    render(await SettingsPage());
    expect(screen.getByRole('link', { name: '문은정 프로필 수정' })).toHaveAttribute('href', '/more/profile');
    expect(screen.getByRole('link', { name: '그룹 설정' })).toHaveAttribute('href', '/more/info');
    expect(screen.getByRole('link', { name: '가입 신청자 (1명)' })).toHaveAttribute('href', '/more/applicants');
    expect(screen.queryByText('초대링크')).not.toBeInTheDocument();
    expect(mocks.getActiveInvite).not.toHaveBeenCalled();
  });

  it('일반 멤버도 프로필과 그룹 카드를 보며 가입 신청자를 조회하지 않는다', async () => {
    mocks.requireMember.mockResolvedValue({ role: 'member', user: { id: 'user-1' } });
    render(await SettingsPage());
    expect(screen.getByRole('link', { name: '문은정 프로필 수정' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '내 그룹' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '그룹 설정' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /가입 신청자/ })).not.toBeInTheDocument();
    expect(mocks.getPendingApplicants).not.toHaveBeenCalled();
  });

  it('관리자의 그룹 설정에 수정, 초대, 권한 이양 기능을 유지한다', async () => {
    render(await GroupSettingsPage());
    expect(screen.getByText('모임 수정')).toBeInTheDocument();
    expect(screen.getByText('초대링크')).toBeInTheDocument();
    expect(screen.getByText('관리자 이양')).toBeInTheDocument();
    expect(screen.queryByText('모임 탈퇴')).not.toBeInTheDocument();
  });

  it('일반 멤버의 그룹 설정은 읽기와 탈퇴만 제공하며 관리자 데이터를 조회하지 않는다', async () => {
    mocks.requireMember.mockResolvedValue({ role: 'member', user: { id: 'user-1' } });
    render(await GroupSettingsPage());
    expect(screen.getByText('모임 소개')).toBeInTheDocument();
    expect(screen.getByText('모임 탈퇴')).toBeInTheDocument();
    expect(screen.queryByText('모임 수정')).not.toBeInTheDocument();
    expect(screen.queryByText('초대링크')).not.toBeInTheDocument();
    expect(screen.queryByText('관리자 이양')).not.toBeInTheDocument();
    expect(mocks.getActiveInvite).not.toHaveBeenCalled();
    expect(mocks.getActiveMembers).not.toHaveBeenCalled();
  });
});
