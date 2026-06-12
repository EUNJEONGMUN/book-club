'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, MoreVertical, Pencil, Share2, Trash2 } from 'lucide-react';
import { deleteMeeting } from '@/lib/actions/meetings';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function MeetingHeaderMenu({
  meetingId,
  clubId,
  isHost,
}: {
  meetingId: string;
  clubId: string;
  isHost: boolean;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleShare() {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    // 1) Native share sheet (best mobile UX, works in most in-app browsers)
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ url });
        return;
      } catch (err) {
        // user cancelled — treat AbortError as silent
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // fall through to clipboard
      }
    }
    // 2) Clipboard
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        toast.success('링크가 복사되었습니다');
        return;
      }
    } catch {
      // fall through
    }
    // 3) Last-resort prompt so user can manually copy
    if (typeof window !== 'undefined') {
      window.prompt('아래 링크를 복사하세요', url);
    } else {
      toast.error('링크 복사를 지원하지 않는 환경입니다');
    }
  }

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      const result = await deleteMeeting(meetingId, clubId);
      if (result && !result.ok) {
        toast.error(result.error);
        setDeleting(false);
      }
      // success path throws NEXT_REDIRECT — keep button disabled until unmount
    } catch (err) {
      // NEXT_REDIRECT is rethrown so server-side navigation happens; for other errors:
      setDeleting(false);
      if (err instanceof Error && !err.message.includes('NEXT_REDIRECT')) {
        toast.error('삭제에 실패했습니다');
      }
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 text-stone-500 hover:text-stone-800"
              aria-label="모임 메뉴"
            />
          }
        >
          <MoreVertical className="w-5 h-5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6} className="min-w-44 p-1.5 space-y-0.5">
          {isHost && (
            <DropdownMenuItem
              className="py-2.5 gap-2"
              onClick={() => router.push(`/clubs/${clubId}/meetings/${meetingId}/edit`)}
            >
              <Pencil className="w-4 h-4" />
              모임 정보 수정
            </DropdownMenuItem>
          )}
          <DropdownMenuItem className="py-2.5 gap-2" onClick={handleShare}>
            <Share2 className="w-4 h-4" />
            공유
          </DropdownMenuItem>
          {isHost && (
            <DropdownMenuItem className="py-2.5 gap-2" variant="destructive" onClick={() => setConfirmOpen(true)}>
              <Trash2 className="w-4 h-4" />
              모임 삭제
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={(o) => !deleting && setConfirmOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>모임을 삭제하시겠어요?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">관련된 참석 정보와 발제문이 모두 삭제됩니다.</p>
          <DialogFooter>
            <Button variant="outline" disabled={deleting} onClick={() => setConfirmOpen(false)}>
              취소
            </Button>
            <Button variant="destructive" disabled={deleting} onClick={handleDelete}>
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  삭제 중...
                </>
              ) : (
                '삭제'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
