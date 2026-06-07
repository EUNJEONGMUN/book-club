'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { sanitizeNext } from '@/lib/auth/safe-next';
import { createProfile } from '@/lib/actions/profile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function CompleteProfileForm({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = sanitizeNext(searchParams.get('next'));
  const supabase = getSupabaseBrowser();
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const profile = await createProfile(displayName);
    setLoading(false);
    if (!profile.ok) return toast.error(profile.error);
    toast.success('가입 완료!');
    router.push(next);
    router.refresh();
  }

  async function cancel() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 space-y-4">
      <p className="text-sm text-stone-500">
        <span className="font-medium text-stone-700">{userEmail}</span>로 로그인되었어요.
        <br />
        모임에서 사용할 이름을 입력해주세요.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-stone-700">이름</Label>
          <Input
            id="name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="홍길동"
            required
            maxLength={20}
            className="bg-stone-50 border-stone-200 focus:bg-white"
          />
        </div>
        <Button type="submit" disabled={loading} className="w-full bg-stone-800 hover:bg-stone-700 text-white">
          {loading ? '처리 중...' : '완료'}
        </Button>
        <Button type="button" variant="ghost" onClick={cancel} className="w-full text-stone-500 hover:text-stone-700">
          취소 (로그아웃)
        </Button>
      </form>
    </div>
  );
}
