'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ImageIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const HEADLINE_MAX = 40;
const BODY_MAX = 200;

export function ShareMeetingImageButton({ meetingId }: { meetingId: string }) {
  const [open, setOpen] = useState(false);
  const [headline, setHeadline] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  async function generateAndShare() {
    if (busy) return;
    setBusy(true);
    try {
      const url = new URL(
        `/api/meetings/${meetingId}/share-image`,
        window.location.origin
      );
      if (headline.trim()) url.searchParams.set('headline', headline.trim());
      if (body.trim()) url.searchParams.set('body', body.trim());

      const res = await fetch(url.toString(), { method: 'GET' });
      if (!res.ok) {
        toast.error('이미지를 만들지 못했어요. 다시 시도해주세요.');
        return;
      }
      const blob = await res.blob();
      const file = new File([blob], 'meeting-share.png', { type: 'image/png' });

      // 1) 모바일: 시스템 share sheet (카톡 등)
      if (
        typeof navigator !== 'undefined' &&
        'canShare' in navigator &&
        navigator.canShare({ files: [file] })
      ) {
        try {
          await navigator.share({ files: [file] });
          setOpen(false);
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') return;
        }
      }

      // 2) Fallback: 다운로드
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = 'meeting-share.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      toast.success('이미지를 다운로드했어요.');
      setOpen(false);
    } catch (err) {
      console.error('[ShareMeetingImageButton]', err);
      toast.error('이미지 생성 중 오류가 발생했어요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="w-full gap-2 border-stone-200 text-stone-700"
        onClick={() => setOpen(true)}
      >
        <ImageIcon className="w-4 h-4" />
        모임 공유 이미지 생성
      </Button>

      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>공유 이미지 만들기</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-stone-500 block mb-1">
                헤드라인 (선택, 최대 {HEADLINE_MAX}자)
              </label>
              <Textarea
                value={headline}
                onChange={(e) => setHeadline(e.target.value.slice(0, HEADLINE_MAX))}
                placeholder={'예: 너, 잘 못 자고 있잖아'}
                rows={1}
                className="text-sm"
              />
              <p className="text-xs text-stone-400 mt-1 text-right tabular-nums">
                {headline.length}/{HEADLINE_MAX}
              </p>
            </div>
            <div>
              <label className="text-xs text-stone-500 block mb-1">
                본문 (선택, 최대 {BODY_MAX}자)
              </label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX))}
                placeholder={
                  '예: 하루의 가장 많은 시간을 보내는 침대.\n그 침대에서 우리는 진정 잘 자고 있는 걸까요?'
                }
                rows={4}
                className="text-sm"
              />
              <p className="text-xs text-stone-400 mt-1 text-right tabular-nums">
                {body.length}/{BODY_MAX}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button disabled={busy} onClick={generateAndShare}>
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  생성 중...
                </>
              ) : (
                '이미지 만들기'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
