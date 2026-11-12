import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const { extract, save, reportError } = vi.hoisted(() => ({
  extract: vi.fn(),
  save: vi.fn(),
  reportError: vi.fn(),
}));
vi.mock('@/lib/actions/discussion-file-extraction', () => ({ extractQuestionsFromPdf: extract }));
vi.mock('@/lib/actions/questions', () => ({ addQuestionsInBulk: save }));
vi.mock('@/lib/actions/discussion-files', () => ({
  prepareDiscussionFileUpload: vi.fn(),
  finishDiscussionFileUpload: vi.fn(),
  removeDiscussionFile: vi.fn(),
}));
vi.mock('@/lib/supabase/discussion-file-upload', () => ({ uploadDiscussionFileToStorage: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: reportError } }));

import { DiscussionFileUploader } from '@/components/meeting/DiscussionFileUploader';

const pdfUrl = 'https://storage.example.test/discussion-files/meeting/questions.pdf';
const question = '가장 기억에 남는 장면은 무엇인가요?';
const extractLabel = /PDF에서 질문 추출/;

beforeEach(() => vi.resetAllMocks());

it.each(['returned failure', 'rejected request'])('PDF 추출 실패 뒤 다시 추출할 수 있다 (%s)', async (failure) => {
  if (failure === 'returned failure') {
    extract.mockResolvedValueOnce({ ok: false, error: 'PDF 분석 실패' });
  } else {
    extract.mockRejectedValueOnce(new Error('network error'));
  }
  extract.mockResolvedValueOnce({ ok: true, questions: [question] });
  render(<DiscussionFileUploader meetingId="meeting" currentFileUrl={pdfUrl} currentFileName="questions.pdf" />);

  fireEvent.click(screen.getByRole('button', { name: extractLabel }));
  await waitFor(() => expect(reportError).toHaveBeenCalledTimes(1));
  const retry = screen.getByRole('button', { name: extractLabel });
  expect(retry).toBeEnabled();
  expect(screen.getByRole('button', { name: '파일 교체' })).toBeEnabled();
  fireEvent.click(retry);

  expect(await screen.findByText(question)).toBeVisible();
  expect(extract).toHaveBeenCalledTimes(2);
});

it.each(['returned failure', 'rejected request'])('저장 실패 뒤 질문 후보를 유지하고 다시 저장할 수 있다 (%s)', async (failure) => {
  extract.mockResolvedValue({ ok: true, questions: [question] });
  if (failure === 'returned failure') {
    save.mockResolvedValueOnce({ ok: false, error: '질문 저장 실패' });
  } else {
    save.mockRejectedValueOnce(new Error('network error'));
  }
  save.mockResolvedValueOnce({ ok: true });
  render(<DiscussionFileUploader meetingId="meeting" currentFileUrl={pdfUrl} currentFileName="questions.pdf" />);

  fireEvent.click(screen.getByRole('button', { name: extractLabel }));
  fireEvent.click(await screen.findByRole('button', { name: '1개 저장' }));
  await waitFor(() => expect(reportError).toHaveBeenCalledTimes(1));

  expect(screen.getByText(question)).toBeVisible();
  const retry = screen.getByRole('button', { name: '1개 저장' });
  expect(retry).toBeEnabled();
  expect(screen.getByRole('button', { name: '파일 교체' })).toBeEnabled();
  fireEvent.click(retry);

  await waitFor(() => expect(screen.queryByText(question)).not.toBeInTheDocument());
  expect(save.mock.calls).toEqual([['meeting', [question]], ['meeting', [question]]]);
});
