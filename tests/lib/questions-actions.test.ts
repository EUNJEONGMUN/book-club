import { beforeEach, expect, it, vi } from 'vitest';

const { rpc, from, revalidateMeetingPaths } = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  revalidateMeetingPaths: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServer: async () => ({ rpc, from }) }));
vi.mock('@/lib/actions/_revalidate-meeting', () => ({ revalidateMeetingPaths }));

import { addQuestion, addQuestionsInBulk, deleteQuestion, updateQuestion } from '@/lib/actions/questions';

beforeEach(() => vi.resetAllMocks());

it('단건과 일괄 등록을 동일한 RPC로 처리하고 일괄 입력 순서를 유지한다', async () => {
  rpc.mockResolvedValue({ error: null });

  await expect(addQuestion('meeting', { content: ' single ' })).resolves.toEqual({ ok: true });
  await expect(addQuestionsInBulk('meeting', [' first ', ' ', ' second '])).resolves.toEqual({ ok: true });

  expect(rpc.mock.calls).toEqual([
    ['append_discussion_questions', { target_meeting_id: 'meeting', question_contents: ['single'] }],
    ['append_discussion_questions', { target_meeting_id: 'meeting', question_contents: ['first', 'second'] }],
  ]);
  expect(from).not.toHaveBeenCalled();
});

it.each([
  ['수정', 'update', () => updateQuestion('question', 'meeting', { content: 'edited' })],
  ['삭제', 'delete', () => deleteQuestion('question', 'meeting')],
] as const)('%s 응답에 실제 반영된 행이 있을 때만 성공으로 처리한다', async (_label, method, action) => {
  const maybeSingle = vi.fn()
    .mockResolvedValueOnce({ data: null, error: null })
    .mockResolvedValueOnce({ data: { id: 'question' }, error: null });
  const select = vi.fn().mockReturnValue({ maybeSingle });
  const eqMeeting = vi.fn().mockReturnValue({ select });
  const eqId = vi.fn().mockReturnValue({ eq: eqMeeting });
  from.mockImplementation((table: string) => table === 'meetings'
    ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'meeting' } }) }) }) }
    : { [method]: () => ({ eq: eqId }) });

  await expect(action()).resolves.toEqual({
    ok: false,
    error: '질문을 찾을 수 없거나 발제자 권한이 없습니다.',
  });
  expect(revalidateMeetingPaths).not.toHaveBeenCalled();
  await expect(action()).resolves.toEqual({ ok: true });
  expect(select).toHaveBeenCalledWith('id');
  expect(eqId).toHaveBeenCalledWith('id', 'question');
  expect(eqMeeting).toHaveBeenCalledWith('meeting_id', 'meeting');
  expect(revalidateMeetingPaths).toHaveBeenCalledExactlyOnceWith('meeting');
});
