'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';

export function LogoutButton() {
  const router = useRouter();
  const supabase = getSupabaseBrowser();
  async function onClick() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }
  return (
    <Button variant="outline" className="h-12 w-full gap-2 rounded-xl border-stone-200 bg-stone-50 text-sm font-medium text-stone-800 hover:bg-stone-100" onClick={onClick}>
      <LogOut className="size-4" /> 로그아웃
    </Button>
  );
}
