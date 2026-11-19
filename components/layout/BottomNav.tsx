'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Calendar, Users, Menu } from 'lucide-react';
import { SeasonalIcon } from '@/components/theme/SeasonalIcon';
import { cn } from '@/lib/utils';

export function BottomNav() {
  const pathname = usePathname();
  const tabs = [
    { href: '/', label: '홈', icon: Home, iconRole: 'home', active: pathname === '/' },
    { href: '/meetings', label: '모임', icon: Calendar, iconRole: 'meetings', active: pathname.startsWith('/meetings') },
    { href: '/members', label: '멤버', icon: Users, iconRole: 'members', active: pathname === '/members' },
    { href: '/more', label: '설정', icon: Menu, iconRole: 'settings', active: pathname.startsWith('/more') },
  ] as const;
  return <nav aria-label="주 메뉴" data-slot="bottom-nav" className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card pb-[var(--safe-bottom)]">
    <ul className="mx-auto grid max-w-md grid-cols-4">{tabs.map(t => <li key={t.href}>
      <Link
        href={t.href}
        aria-current={t.active ? 'page' : undefined}
        className={cn('flex h-[var(--bottom-nav-row-height)] flex-col items-center justify-center gap-1 text-xs', t.active ? 'font-semibold text-foreground' : 'text-muted-foreground')}
      >
        <span data-part="nav-icon" className="grid size-9 place-items-center rounded-[0.7rem]">
          <SeasonalIcon iconRole={t.iconRole} className="size-5">
            <t.icon className="size-5" />
          </SeasonalIcon>
        </span>
        <span data-part="nav-label">{t.label}</span>
      </Link>
    </li>)}</ul>
  </nav>;
}
