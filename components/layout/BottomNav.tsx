'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Calendar, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/', label: '홈', icon: Home, match: (p: string) => p === '/' },
  { href: '/meetings', label: '모임', icon: Calendar, match: (p: string) => p.startsWith('/meetings') },
  { href: '/more', label: '설정', icon: Menu, match: (p: string) => p.startsWith('/more') },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed bottom-0 inset-x-0 bg-white border-t z-50"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="flex">
        {TABS.map((t) => {
          const active = t.match(pathname);
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                className={cn(
                  'flex flex-col items-center gap-1 py-3 text-xs',
                  active ? 'text-slate-900 font-semibold' : 'text-slate-500'
                )}
              >
                <t.icon className="w-5 h-5" />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
