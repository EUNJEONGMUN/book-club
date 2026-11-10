'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Calendar, Users, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BottomNav() {
  const pathname = usePathname();
  const tabs = [
    { href: '/', label: '홈', icon: Home, active: pathname === '/' },
    { href: '/meetings', label: '모임', icon: Calendar, active: pathname.startsWith('/meetings') },
    { href: '/members', label: '멤버', icon: Users, active: pathname === '/members' },
    { href: '/more', label: '설정', icon: Menu, active: pathname.startsWith('/more') },
  ];
  return <nav className="fixed bottom-0 inset-x-0 bg-white border-t z-50" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
    <ul className="flex">{tabs.map(t => <li key={t.href} className="flex-1">
      <Link href={t.href} className={cn('flex flex-col items-center gap-1 py-3 text-xs', t.active ? 'text-slate-900 font-semibold' : 'text-slate-500')}>
        <t.icon className="w-5 h-5" />{t.label}
      </Link>
    </li>)}</ul>
  </nav>;
}
