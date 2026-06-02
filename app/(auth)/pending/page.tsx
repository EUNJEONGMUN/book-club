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
    <div className="min-h-screen flex items-center justify-center p-6 bg-stone-50">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <div className="text-4xl">📖</div>
          <h1 className="text-2xl font-semibold text-stone-800 tracking-tight">부글부글</h1>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 text-center space-y-4">
          <p className="text-3xl">⏳</p>
          <div className="space-y-1">
            <h2 className="font-semibold text-stone-800">승인 대기 중</h2>
            <p className="text-sm text-stone-500">
              가입 신청이 접수되었습니다.
              <br />
              관리자 승인 후 이용하실 수 있어요.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={logout}
            className="w-full border-stone-200 text-stone-600 hover:bg-stone-50"
          >
            로그아웃
          </Button>
        </div>
      </div>
    </div>
  );
}
