import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  meetingMaybeSingle: vi.fn(),
  getUser: vi.fn(),
  deleteSelect: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServer: async () => ({
    auth: { getUser: mocks.getUser },
    from: (table: string) => {
      if (table === 'meetings') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: mocks.meetingMaybeSingle }) }),
        };
      }
      if (table === 'meeting_reviews') {
        return {
          delete: () => ({
            eq: () => ({ eq: () => ({ select: mocks.deleteSelect }) }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/actions/_revalidate-meeting', () => ({ revalidateMeetingPaths: vi.fn() }));

import { deleteMyReview } from '@/lib/actions/reviews';

describe('deleteMyReview RLS row-count 검사', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.meetingMaybeSingle.mockResolvedValue({ data: { id: 'm1' }, error: null });
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  });

  it('RLS에 의해 0 rows가 돌아오면 ok=false를 반환한다', async () => {
    mocks.deleteSelect.mockResolvedValue({ data: [], error: null });
    await expect(deleteMyReview('m1')).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('권한'),
    });
  });

  it('data=null이어도 ok=false를 반환한다 (방어)', async () => {
    mocks.deleteSelect.mockResolvedValue({ data: null, error: null });
    await expect(deleteMyReview('m1')).resolves.toMatchObject({ ok: false });
  });

  it('실제 삭제된 row가 있으면 ok=true를 반환한다', async () => {
    mocks.deleteSelect.mockResolvedValue({ data: [{ id: 'r1' }], error: null });
    await expect(deleteMyReview('m1')).resolves.toEqual({ ok: true });
  });
});
