import { beforeEach, describe, expect, it, vi } from 'vitest';
const { single } = vi.hoisted(() => ({ single: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => ({ from: () => ({ select: () => ({ eq: () => ({ single }) }) }) }) }));
import { getClubName } from '@/lib/club-name';
describe('모임 표시 이름', () => {
  beforeEach(() => single.mockReset());
  it('고정 문자열 대신 저장된 이름을 사용한다', async () => {
    single.mockResolvedValue({ data: { name: '변경한 모임 이름' }, error: null });
    expect(await getClubName()).toBe('변경한 모임 이름');
  });
  it('이름 조회 장애가 로그인 화면을 깨뜨리지 않는다', async () => {
    single.mockResolvedValue({ data: null, error: { message: 'unavailable' } });
    expect(await getClubName()).toBe('부글부글');
  });
});
