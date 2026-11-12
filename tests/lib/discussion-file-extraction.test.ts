// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getUser, getMeeting, generateContent } = vi.hoisted(() => ({
  getUser: vi.fn(),
  getMeeting: vi.fn(),
  generateContent: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServer: async () => ({
    auth: { getUser },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: getMeeting }) }),
    }),
  }),
}));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class { models = { generateContent }; },
  Type: { OBJECT: 'OBJECT', ARRAY: 'ARRAY', STRING: 'STRING' },
}));

import { extractQuestionsFromPdf } from '@/lib/actions/discussion-file-extraction';

const origin = 'https://storage.example.test';
const bucketUrl = `${origin}/storage/v1/object/public/discussion-files`;
const meetingId = 'my-meeting';
const registeredUrl = `${bucketUrl}/${meetingId}/발제%20자료.pdf?download=1`;
const fetchFile = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', origin);
  vi.stubEnv('GEMINI_API_KEY', 'test-key');
  vi.stubGlobal('fetch', fetchFile);
  getUser.mockResolvedValue({ data: { user: { id: 'host' } } });
  getMeeting.mockResolvedValue({ data: { host_id: 'host', discussion_file_url: registeredUrl } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('PDF 추출 파일 경로', () => {
  it('DB에 등록된 한글 파일 경로에서만 PDF를 읽고 리다이렉트를 따르지 않는다', async () => {
    fetchFile.mockResolvedValueOnce(new Response(null, { headers: { 'content-length': '8' } }));
    fetchFile.mockResolvedValueOnce(new Response('%PDF-1.7'));
    generateContent.mockResolvedValue({ text: '{"questions":["어떤 장면이 기억에 남나요?"]}' });

    await expect(extractQuestionsFromPdf(meetingId, registeredUrl))
      .resolves.toEqual({ ok: true, questions: ['어떤 장면이 기억에 남나요?'] });

    const canonicalUrl = new URL(`${bucketUrl}/${meetingId}/발제%20자료.pdf`);
    expect(fetchFile).toHaveBeenCalledTimes(2);
    expect(fetchFile).toHaveBeenNthCalledWith(1, canonicalUrl, expect.objectContaining({ method: 'HEAD', redirect: 'error' }));
    expect(fetchFile).toHaveBeenNthCalledWith(2, canonicalUrl, expect.objectContaining({ redirect: 'error' }));
  });

  it.each([
    `${bucketUrl}/${meetingId}/../another-meeting/other.pdf`,
    `${bucketUrl}/${meetingId}/old.pdf`,
  ])('브라우저가 현재 첨부와 다른 URL을 보내면 거부한다 (%s)', async (url) => {
    await expect(extractQuestionsFromPdf(meetingId, url)).resolves.toMatchObject({ ok: false });
    expect(fetchFile).not.toHaveBeenCalled();
    expect(generateContent).not.toHaveBeenCalled();
  });

  it.each([
    `${bucketUrl}/${meetingId}/../another-meeting/other.pdf`,
    `${bucketUrl}/${meetingId}/%2e%2e%2fanother-meeting/other.pdf`,
    `https://elsewhere.example.test/storage/v1/object/public/discussion-files/${meetingId}/other.pdf`,
    `${bucketUrl}/${meetingId}/image.png`,
  ])('DB에 저장된 경로라도 이 모임의 PDF 경로가 아니면 거부한다 (%s)', async (url) => {
    getMeeting.mockResolvedValue({ data: { host_id: 'host', discussion_file_url: url } });

    await expect(extractQuestionsFromPdf(meetingId, url))
      .resolves.toEqual({ ok: false, error: '잘못된 파일 경로입니다.' });
    expect(fetchFile).not.toHaveBeenCalled();
    expect(generateContent).not.toHaveBeenCalled();
  });
});
