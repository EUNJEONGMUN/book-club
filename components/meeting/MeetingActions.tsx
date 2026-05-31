'use client';

import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { deleteMeeting } from '@/lib/actions/meetings';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';

export function MeetingActions({ meetingId }: { meetingId: string }) {
  const [open, setOpen] = useState(false);

  async function onDelete() {
    const result = await deleteMeeting(meetingId);
    // deleteMeeting only returns on error — on success it redirects (throws NEXT_REDIRECT)
    if (result && !result.ok) toast.error(result.error);
  }

  return (
    <div className="flex gap-2">
      <Link href={`/meetings/${meetingId}/edit`} className="flex-1">
        <Button variant="outline" className="w-full">수정</Button>
      </Link>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button variant="destructive" />}>삭제</DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>모임을 삭제하시겠어요?</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600">관련된 참석 정보와 발제문이 모두 삭제됩니다.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>취소</Button>
            <Button variant="destructive" onClick={onDelete}>삭제</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
