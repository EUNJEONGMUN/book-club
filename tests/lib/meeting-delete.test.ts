import { beforeEach, expect, it, vi } from 'vitest';

const { select, redirect, revalidateMeetingPaths } = vi.hoisted(() => ({
  select: vi.fn(),
  redirect: vi.fn(() => { throw new Error('redirect'); }),
  revalidateMeetingPaths: vi.fn(),
}));

vi.mock('@/lib/auth/membership', () => ({ requireMember: async () => undefined }));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServer: async () => ({ from: () => ({ delete: () => ({ eq: () => ({ select }) }) }) }),
}));
vi.mock('next/navigation', () => ({ redirect }));
vi.mock('@/lib/actions/_revalidate-meeting', () => ({ revalidateMeetingPaths }));

import { deleteMeeting } from '@/lib/actions/meetings';

beforeEach(() => vi.clearAllMocks());

it.each([
  [2023, '/meetings?view=bookshelf&year=2023'],
  [undefined, '/meetings'],
  [2023.5, '/meetings'],
] as const)('삭제 성공 시 책장 연도 %s에 해당하는 복귀 주소를 선택한다', async (year, href) => {
  select.mockResolvedValue({ data: [{ id: 'meeting', discussion_file_url: null }], error: null });

  await expect(deleteMeeting('meeting', year)).rejects.toThrow('redirect');
  expect(revalidateMeetingPaths).toHaveBeenCalledExactlyOnceWith('meeting');
  expect(redirect).toHaveBeenCalledExactlyOnceWith(href);
});

it('삭제할 수 있는 행이 없으면 책장으로 이동하지 않는다', async () => {
  select.mockResolvedValue({ data: [], error: null });

  await expect(deleteMeeting('meeting', 2023)).resolves.toEqual({
    ok: false,
    error: '작성자만 모임을 삭제할 수 있어요.',
  });
  expect(revalidateMeetingPaths).not.toHaveBeenCalled();
  expect(redirect).not.toHaveBeenCalled();
});
