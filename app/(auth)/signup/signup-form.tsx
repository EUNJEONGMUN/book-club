'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { createProfile } from '@/lib/actions/profile';
import { consumeInvite } from '@/lib/actions/invite';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function SignupForm({ token }: { token: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const supabase = getSupabaseBrowser();

  async function signupEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error || !data.user) {
      setLoading(false);
      return toast.error(error?.message ?? '가입 실패');
    }

    const userId = data.user.id;
    const consumed = await consumeInvite(token, userId);
    if (!consumed.ok) {
      setLoading(false);
      return toast.error(consumed.error);
    }

    const profile = await createProfile(displayName);
    setLoading(false);
    if (!profile.ok) return toast.error(profile.error);

    toast.success('가입 완료!');
    router.push('/');
    router.refresh();
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader><CardTitle>독서모임 가입</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={signupEmail} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="name">이름</Label>
            <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required maxLength={20} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="email">이메일</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">비밀번호</Label>
            <Input id="password" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <Button type="submit" disabled={loading} className="w-full">가입하기</Button>
        </form>
      </CardContent>
    </Card>
  );
}
