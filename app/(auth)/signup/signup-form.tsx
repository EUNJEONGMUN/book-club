'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { authPath } from '@/lib/auth/safe-next';
import { createProfile } from '@/lib/actions/profile';
import { profileFormSchema } from '@/lib/validation/profile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function SignupForm({ next }: { next: string }) {
  const router = useRouter();
  const loginPath = authPath('/login', next);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const supabase = getSupabaseBrowser();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = profileFormSchema.safeParse({ display_name: displayName });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: next === '/' ? undefined : {
        emailRedirectTo: new URL(authPath('/auth/callback', next), window.location.origin).toString(),
      },
    });
    if (error || !data.user) {
      setLoading(false);
      return toast.error(error?.message ?? '가입 실패');
    }

    // 이메일 인증이 필요한 경우 session이 null — 인증 후 /signup에서 이름 입력
    if (!data.session) {
      setLoading(false);
      toast.success('확인 메일을 보냈어요. 이메일 인증을 완료해주세요.');
      router.push(loginPath);
      return;
    }

    const profile = await createProfile(parsed.data.display_name);
    setLoading(false);
    if (!profile.ok) {
      toast.error('계정은 생성됐어요. 로그인 후 이름 등록을 완료해주세요.');
      router.push(loginPath);
      return;
    }

    toast.success('가입 완료!');
    router.push(next);
    router.refresh();
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 space-y-4">
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
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-stone-700">이메일</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            required
            className="bg-stone-50 border-stone-200 focus:bg-white"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-stone-700">비밀번호</Label>
          <Input
            id="password"
            type="password"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="6자 이상"
            required
            className="bg-stone-50 border-stone-200 focus:bg-white"
          />
        </div>
        <Button
          type="submit"
          disabled={loading}
          className="w-full bg-stone-800 hover:bg-stone-700 text-white"
        >
          {loading ? '처리 중...' : '가입하기'}
        </Button>
      </form>
    </div>
  );
}
