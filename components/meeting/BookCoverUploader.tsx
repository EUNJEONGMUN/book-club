'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { getSupabaseBrowser } from '@/lib/supabase/client';

export function BookCoverUploader({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const supabase = getSupabaseBrowser();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error('5MB 이하만 가능합니다');

    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('book-covers').upload(path, file, { upsert: false });
    if (error) {
      setUploading(false);
      return toast.error(error.message);
    }
    const { data: pub } = supabase.storage.from('book-covers').getPublicUrl(path);
    onChange(pub.publicUrl);
    setUploading(false);
  }

  return (
    <div className="space-y-2">
      <div className="w-24 h-32 bg-slate-100 rounded overflow-hidden flex items-center justify-center">
        {value ? (
          <img src={value} alt="책 표지" className="w-full h-full object-cover" />
        ) : (
          <span className="text-2xl text-slate-300">📚</span>
        )}
      </div>
      <div className="flex gap-2 items-center">
        <label className="inline-block">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFile}
            disabled={uploading}
          />
          <span className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium border h-8 px-3 cursor-pointer ${uploading ? 'opacity-50' : 'hover:bg-slate-50'}`}>
            {uploading ? '업로드 중...' : '책 표지 업로드'}
          </span>
        </label>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium h-8 px-3 hover:bg-slate-100"
          >
            제거
          </button>
        )}
      </div>
    </div>
  );
}
