'use client';

import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { Home, Calendar, Users, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BottomNav({ fallbackClubId }: { fallbackClubId?: string }) {
  const pathname = usePathname();
  const params = useParams<{ id?: string }>();
  const clubId = params?.id ?? fallbackClubId;

  // Inside a group layout, params.id is always present.
  const tabs = clubId
    ? [
        {
          href: `/clubs/${clubId}`,
          label: '홈',
          icon: Home,
          match: (p: string) => p === `/clubs/${clubId}`,
        },
        {
          href: `/clubs/${clubId}/meetings`,
          label: '모임',
          icon: Calendar,
          match: (p: string) => p.startsWith(`/clubs/${clubId}/meetings`),
        },
        {
          href: `/clubs/${clubId}/members`,
          label: '멤버',
          icon: Users,
          match: (p: string) => p.startsWith(`/clubs/${clubId}/members`),
        },
        {
          href: '/more',
          label: '설정',
          icon: Menu,
          match: (p: string) => p.startsWith('/more'),
        },
      ]
    : [];

  if (tabs.length === 0) return null;

  return (
    <nav
      className="fixed bottom-0 inset-x-0 bg-white border-t z-50"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="flex">
        {tabs.map((t) => {
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
