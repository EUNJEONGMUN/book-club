'use client';

import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';

export default function PendingPage() {
  const router = useRouter();

  async function logout() {
    const supabase = getSupabaseBrowser();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <div className="text-center space-y-4 max-w-sm">
        <p className="text-4xl">⏳</p>
        <h1 className="text-xl font-bold">승인 대기 중</h1>
        <p className="text-slate-600 text-sm">
          가입 신청이 접수되었습니다.
          <br />
          관리자 승인 후 서비스를 이용하실 수 있습니다.
        </p>
        <Button variant="outline" onClick={logout} className="w-full">로그아웃</Button>
      </div>
    </div>
  );
}
