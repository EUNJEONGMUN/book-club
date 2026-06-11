'use client';

import Link from 'next/link';
import { ChevronDown, List, Settings } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { MyClub } from '@/lib/queries/clubs';

export function ClubSwitcher({
  currentClub,
  currentRole,
  allClubs,
}: {
  currentClub: { id: string; name: string };
  currentRole: 'admin' | 'member';
  allClubs: MyClub[];
}) {
  const others = allClubs.filter((c) => c.id !== currentClub.id);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1 text-base font-semibold text-stone-800 hover:text-stone-600 transition-colors">
        <span className="truncate max-w-[200px]">{currentClub.name}</span>
        <ChevronDown className="w-4 h-4 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="min-w-56">
        {others.length > 0 && (
          <>
            {others.map((c) => (
              <Link key={c.id} href={`/clubs/${c.id}`}>
                <DropdownMenuItem className="cursor-pointer">
                  {c.name}
                </DropdownMenuItem>
              </Link>
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        <Link href={`/clubs/${currentClub.id}/settings`}>
          <DropdownMenuItem className="cursor-pointer gap-2">
            <Settings className="w-4 h-4" />
            그룹 설정
          </DropdownMenuItem>
        </Link>
        <DropdownMenuSeparator />
        <Link href="/clubs">
          <DropdownMenuItem className="cursor-pointer gap-2">
            <List className="w-4 h-4" />
            그룹 목록
          </DropdownMenuItem>
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
