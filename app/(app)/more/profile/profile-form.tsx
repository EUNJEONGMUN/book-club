'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { updateProfile } from '@/lib/actions/profile';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AvatarPicker } from '@/components/profile/AvatarPicker';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { profileFormSchema } from '@/lib/validation/profile';

async function uploadAvatar(file: File) {
  const supabase = getSupabaseBrowser();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다');
  const id = crypto.randomUUID();
  const { error } = await supabase.storage.from('avatars').upload(`${user.id}/${id}`, file);
  if (error) throw error;
  return id;
}

export function ProfileForm({
  defaultName,
  avatarUrl,
  cancelHref,
}: {
  defaultName: string;
  avatarUrl: string | null;
  cancelHref: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [savedAvatarUrl, setSavedAvatarUrl] = useState(avatarUrl);
  const [photo, setPhoto] = useState<File | null>(null);
  const uploadedPhoto = useRef<{ file: File; id: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    const parsed = profileFormSchema.safeParse({ display_name: name });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);

    setLoading(true);
    try {
      if (photo && uploadedPhoto.current?.file !== photo) {
        uploadedPhoto.current = { file: photo, id: await uploadAvatar(photo) };
      }
      const r = await updateProfile({ ...parsed.data, avatarId: uploadedPhoto.current?.id });
      if (!r.ok) return toast.error(r.error);
      setName(r.profile.display_name);
      setSavedAvatarUrl(r.profile.avatar_url);
      setPhoto(null);
      uploadedPhoto.current = null;
      toast.success('저장되었습니다');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '프로필을 저장하지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <AvatarPicker url={savedAvatarUrl} file={photo} displayName={name} disabled={loading} onSelect={setPhoto} />
      <div className="space-y-1">
        <Label htmlFor="profile-display-name">이름</Label>
        <Input id="profile-display-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} disabled={loading} />
      </div>
      <div className="flex gap-2">
        {loading ? (
          <Button type="button" variant="outline" disabled className="min-h-11 flex-1">취소</Button>
        ) : (
          <Link href={cancelHref} className={buttonVariants({ variant: 'outline', className: 'min-h-11 flex-1' })}>취소</Link>
        )}
        <Button type="submit" disabled={loading} className="min-h-11 flex-1">
          {loading ? '저장 중…' : '저장'}
        </Button>
      </div>
    </form>
  );
}
