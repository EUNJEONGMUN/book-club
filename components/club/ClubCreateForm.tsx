'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { createClub } from '@/lib/actions/clubs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ClubCreateForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    const result = await createClub({ name });
    if (!result.ok) {
      setSubmitting(false);
      toast.error(result.error);
      return;
    }
    toast.success('그룹을 만들었어요.');
    router.push(`/clubs/${result.clubId}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name" className="text-stone-700">그룹 이름</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 강남 직장인 독서모임"
          required
          maxLength={50}
          className="bg-stone-50 border-stone-200 focus:bg-white"
        />
      </div>
      <Button
        type="submit"
        disabled={submitting || name.trim().length === 0}
        className="w-full bg-stone-800 hover:bg-stone-700 text-white"
      >
        {submitting ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />만드는 중...</>
        ) : (
          '그룹 만들기'
        )}
      </Button>
    </form>
  );
}
