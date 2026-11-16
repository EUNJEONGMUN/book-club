'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Calendar, Users, Menu } from 'lucide-react';
import { SeasonalIcon } from '@/components/theme/SeasonalIcon';
import { cn } from '@/lib/utils';

export function BottomNav() {
  const pathname = usePathname();
  const tabs = [
    { href: '/', label: '홈', icon: Home, kind: 'home', active: pathname === '/' },
    { href: '/meetings', label: '모임', icon: Calendar, kind: 'meetings', active: pathname.startsWith('/meetings') },
    { href: '/members', label: '멤버', icon: Users, kind: 'members', active: pathname === '/members' },
    { href: '/more', label: '설정', icon: Menu, kind: 'settings', active: pathname.startsWith('/more') },
  ] as const;
  return <nav className="app-bottom-nav fixed bottom-0 inset-x-0 bg-white border-t z-50" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
    <ul className="flex">{tabs.map(t => <li key={t.href} className="flex-1">
      <Link href={t.href} aria-current={t.active ? 'page' : undefined} className={cn('flex flex-col items-center gap-1 py-3 text-xs', t.active ? 'text-slate-900 font-semibold' : 'text-slate-500')}>
        <SeasonalIcon kind={t.kind} className="size-5">
          <t.icon className="size-5" />
        </SeasonalIcon>
        {t.label}
      </Link>
    </li>)}</ul>
  </nav>;
}
