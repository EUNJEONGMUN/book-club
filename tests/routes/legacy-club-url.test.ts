import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/legacy-club-url', () => ({ getLegacyClubId: async () => 'retained' }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => { throw new Error(`redirect:${path}`); },
  notFound: () => { throw new Error('not-found'); },
}));
import LegacyMeeting from '@/app/(app)/clubs/[id]/meetings/[meetingId]/page';
import LegacySettings from '@/app/(app)/clubs/[id]/settings/page';
import LegacyHome from '@/app/(app)/clubs/[id]/page';

describe('기존 부글부글 링크 연결', () => {
  it('기존 일정 ID를 유지해 새 주소로 연결한다', async () => {
    await expect(LegacyMeeting({ params: Promise.resolve({ id: 'retained', meetingId: 'original-meeting' }) }))
      .rejects.toThrow('redirect:/meetings/original-meeting');
  });
  it('기존 설정 주소도 단일 설정 화면으로 연결한다', async () => {
    await expect(LegacySettings({ params: Promise.resolve({ id: 'retained' }) }))
      .rejects.toThrow('redirect:/more');
  });
  it('다른 그룹의 링크를 부글부글 일정으로 연결하지 않는다', async () => {
    await expect(LegacyMeeting({ params: Promise.resolve({ id: 'other', meetingId: 'original-meeting' }) }))
      .rejects.toThrow('not-found');
  });
  it('다른 그룹의 홈 주소도 404로 처리한다', async () => {
    await expect(LegacyHome({ params: Promise.resolve({ id: 'other' }) }))
      .rejects.toThrow('not-found');
  });
});
