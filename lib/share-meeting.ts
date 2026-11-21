import { toast } from 'sonner';

async function copyLink(url: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

async function openSystemShare(url: string): Promise<boolean> {
  try {
    if (typeof navigator.share !== 'function') return false;
    await navigator.share({ url });
    return true;
  } catch {
    return false;
  }
}

export async function shareMeetingLink(url: string): Promise<void> {
  const sharedUrl = new URL(url);
  if (sharedUrl.searchParams.get('from') === 'home') {
    sharedUrl.searchParams.delete('from');
  }

  // Start copying before system sharing consumes the activation from this click.
  const copying = copyLink(sharedUrl.href);
  const sharing = openSystemShare(sharedUrl.href);
  if (await copying) {
    toast.success('모임 링크를 복사했어요');
    return;
  }

  if (!(await sharing)) {
    window.prompt('아래 링크를 복사하세요', sharedUrl.href);
  }
}
