'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { updateProfile } from '@/lib/actions/profile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AvatarUploader } from '@/components/profile/AvatarUploader';

export function ProfileForm({
  defaultName,
  avatarUrl,
}: {
  defaultName: string;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [loading, setLoading] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const r = await updateProfile({ display_name: name });
    setLoading(false);
    if (!r.ok) return toast.error(r.error);
    toast.success('저장되었습니다');
    router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <AvatarUploader initialUrl={avatarUrl} displayName={name} />
      <div className="space-y-1">
        <Label htmlFor="name">이름</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} />
      </div>
      <Button type="submit" disabled={loading} className="w-full">저장</Button>
    </form>
  );
}
