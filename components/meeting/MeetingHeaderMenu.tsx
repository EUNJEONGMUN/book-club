'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { MoreVertical, Pencil, Share2, Trash2 } from 'lucide-react';
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

export function MeetingHeaderMenu({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleShare() {
    try {
      const url = typeof window !== 'undefined' ? window.location.href : '';
      await navigator.clipboard.writeText(url);
      toast.success('링크가 복사되었습니다');
    } catch {
      toast.error('링크 복사에 실패했습니다');
    }
  }

  async function handleDelete() {
    const result = await deleteMeeting(meetingId);
    if (result && !result.ok) toast.error(result.error);
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
        <DropdownMenuContent align="end" sideOffset={6} className="min-w-44">
          <DropdownMenuItem onClick={() => router.push(`/meetings/${meetingId}/edit`)}>
            <Pencil className="w-4 h-4" />
            모임 정보 수정
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleShare}>
            <Share2 className="w-4 h-4" />
            공유
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmOpen(true)}>
            <Trash2 className="w-4 h-4" />
            모임 삭제
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>모임을 삭제하시겠어요?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">관련된 참석 정보와 발제문이 모두 삭제됩니다.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              취소
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
