'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { createProfile } from '@/lib/actions/profile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function CompleteProfileForm({ userEmail }: { userEmail: string }) {
  const router = useRouter();
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
    router.push('/');
    router.refresh();
  }

  async function cancel() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>프로필 설정</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-slate-600">
          <strong>{userEmail}</strong>로 로그인되었습니다.
          <br />
          사용할 이름을 입력해주세요.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="name">이름</Label>
            <Input
              id="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              maxLength={20}
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full">완료</Button>
          <Button type="button" variant="ghost" onClick={cancel} className="w-full">취소 (로그아웃)</Button>
        </form>
      </CardContent>
    </Card>
  );
}
