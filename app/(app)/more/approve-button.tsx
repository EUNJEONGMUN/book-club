'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { approveUser } from '@/lib/actions/admin';
import { Button } from '@/components/ui/button';

export function ApproveButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleApprove() {
    setLoading(true);
    const result = await approveUser(userId);
    setLoading(false);
    if (!result.ok) return toast.error(result.error);
    toast.success('승인되었습니다');
    router.refresh();
  }

  return (
    <Button size="sm" onClick={handleApprove} disabled={loading}>
      승인
    </Button>
  );
}
