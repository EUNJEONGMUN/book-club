import { toast } from 'sonner';

/**
 * 공유 fallback chain — native share sheet → clipboard → prompt.
 * 모바일에서는 카톡/문자 등 시스템 공유 시트가 뜸. PC면 클립보드 복사.
 */
export async function shareMeetingLink(url: string): Promise<void> {
  if (typeof navigator !== 'undefined' && 'share' in navigator) {
    try {
      await navigator.share({ url });
      return;
    } catch (err) {
      // 사용자가 닫음 — silent
      if (err instanceof DOMException && err.name === 'AbortError') return;
      // 다른 에러 (권한 등) — clipboard fallback
    }
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      toast.success('링크가 복사되었습니다');
      return;
    }
  } catch {
    // continue to prompt fallback
  }
  if (typeof window !== 'undefined') {
    window.prompt('아래 링크를 복사하세요', url);
  } else {
    toast.error('링크 복사를 지원하지 않는 환경입니다');
  }
}
