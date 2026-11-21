import { toast } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { shareMeetingLink } from '@/lib/share-meeting';

const url = 'https://example.test/meetings/123';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('shareMeetingLink', () => {
  it('copies immediately when system sharing is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const success = vi.spyOn(toast, 'success').mockReturnValue('toast');
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await shareMeetingLink(`${url}?from=home`);

    expect(writeText).toHaveBeenCalledWith(url);
    expect(success).toHaveBeenCalledWith('모임 링크를 복사했어요');
  });

  it('keeps the copied link available when the user dismisses system sharing', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const share = vi.fn().mockRejectedValue(new DOMException('Dismissed', 'AbortError'));
    vi.spyOn(toast, 'success').mockReturnValue('toast');
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null);
    vi.stubGlobal('navigator', { clipboard: { writeText }, share });

    await shareMeetingLink(url);

    expect(writeText).toHaveBeenCalledBefore(share);
    expect(share).toHaveBeenCalledWith({ url });
    expect(prompt).not.toHaveBeenCalled();
  });

  it('offers manual copying if automatic copying and sharing both fail', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Clipboard unavailable'));
    const share = vi.fn().mockRejectedValue(new Error('Sharing unavailable'));
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null);
    vi.stubGlobal('navigator', { clipboard: { writeText }, share });

    await shareMeetingLink(url);

    expect(prompt).toHaveBeenCalledWith('아래 링크를 복사하세요', url);
  });
});
