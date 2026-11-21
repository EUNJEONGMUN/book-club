'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

const imageTypes = ['image/jpeg', 'image/png', 'image/webp'];

export function AvatarPicker({
  url,
  file,
  displayName,
  disabled,
  onSelect,
}: {
  url: string | null;
  file: File | null;
  displayName: string;
  disabled: boolean;
  onSelect: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string>();

  useEffect(() => {
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!selected) return;
    if (!imageTypes.includes(selected.type)) return toast.error('JPG, PNG, WebP 이미지를 선택해주세요.');
    if (selected.size > 5 * 1024 * 1024) return toast.error('5MB 이하만 가능합니다');
    onSelect(selected);
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Avatar className="w-20 h-20">
        <AvatarImage src={(file ? previewUrl : url) ?? undefined} alt={displayName} />
        <AvatarFallback>{displayName.slice(0, 1)}</AvatarFallback>
      </Avatar>
      <input
        ref={input}
        type="file"
        accept={imageTypes.join(',')}
        aria-label="프로필 사진"
        className="hidden"
        onChange={handleFile}
        disabled={disabled}
      />
      <Button type="button" variant="outline" disabled={disabled} onClick={() => input.current?.click()}>
        사진 변경
      </Button>
    </div>
  );
}
