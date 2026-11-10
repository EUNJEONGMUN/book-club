import { describe, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({
  redirect: (path: string) => { throw new Error(`redirect:${path}`); },
}));
import ClubsPage from '@/app/(app)/clubs/page';
import NewClubPage from '@/app/(app)/clubs/new/page';
describe('이전 그룹 URL', () => {
  it('그룹 목록 대신 홈으로 이동한다', () => {
    expect(() => ClubsPage()).toThrow('redirect:/');
  });
  it('생성 페이지를 다시 제공하지 않는다', () => {
    expect(() => NewClubPage()).toThrow('redirect:/');
  });
});
