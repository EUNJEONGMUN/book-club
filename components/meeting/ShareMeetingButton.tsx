'use client';

import { Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { shareMeetingLink } from '@/lib/share-meeting';

export function ShareMeetingButton() {
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full gap-2 border-border text-foreground"
      onClick={() => shareMeetingLink(window.location.href)}
    >
      <Share2 className="w-4 h-4" />
      모임 공유 (카톡 / 링크 복사)
    </Button>
  );
}
