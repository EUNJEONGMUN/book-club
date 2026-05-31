'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { updateAvatarUrl } from '@/lib/actions/profile';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export function AvatarUploader({
  initialUrl,
  displayName,
}: {
  initialUrl: string | null;
  displayName: string;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [uploading, setUploading] = useState(false);
  const supabase = getSupabaseBrowser();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error('5MB 이하만 가능합니다');

    setUploading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setUploading(false);
      return toast.error('로그인 필요');
    }
    const ext = file.name.split('.').pop();
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
    if (error) {
      setUploading(false);
      return toast.error(error.message);
    }
    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
    const r = await updateAvatarUrl(pub.publicUrl);
    setUploading(false);
    if (!r.ok) return toast.error(r.error);
    setUrl(pub.publicUrl);
    toast.success('프로필 사진 업데이트');
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Avatar className="w-20 h-20">
        <AvatarImage src={url ?? undefined} alt={displayName} />
        <AvatarFallback>{displayName.slice(0, 1)}</AvatarFallback>
      </Avatar>
      <label className="inline-block">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFile}
          disabled={uploading}
        />
        <span className={`inline-flex items-center justify-center rounded-md text-sm font-medium border h-8 px-3 cursor-pointer ${uploading ? 'opacity-50' : 'hover:bg-slate-50'}`}>
          {uploading ? '업로드 중...' : '사진 변경'}
        </span>
      </label>
    </div>
  );
}
