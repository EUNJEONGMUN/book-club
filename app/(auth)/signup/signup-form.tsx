'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { createProfile } from '@/lib/actions/profile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function SignupForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const supabase = getSupabaseBrowser();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error || !data.user) {
      setLoading(false);
      return toast.error(error?.message ?? '가입 실패');
    }

    // 이메일 인증이 필요한 경우 session이 null — 인증 후 /signup에서 이름 입력
    if (!data.session) {
      setLoading(false);
      toast.success('가입 신청 완료! 이메일 인증 후 로그인해주세요.');
      router.push('/login');
      return;
    }

    // user.id를 직접 전달해 세션 쿠키 의존 없이 프로필 생성
    const profile = await createProfile(displayName, data.user.id);
    setLoading(false);
    if (!profile.ok) return toast.error(profile.error);

    toast.success('가입 완료!');
    router.push('/');
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
