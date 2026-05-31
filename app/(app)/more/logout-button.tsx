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
    <Button variant="outline" className="w-full" onClick={onClick}>
      <LogOut className="w-4 h-4 mr-2" /> 로그아웃
    </Button>
  );
}
