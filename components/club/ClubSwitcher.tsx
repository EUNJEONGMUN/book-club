'use client';

import Link from 'next/link';
import { ChevronDown, List } from 'lucide-react';
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
  allClubs,
}: {
  currentClub: { id: string; name: string };
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
              <DropdownMenuItem key={c.id}>
                <Link href={`/clubs/${c.id}`} className="cursor-pointer w-full">
                  {c.name}
                </Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem>
          <Link href="/clubs" className="cursor-pointer flex items-center gap-2 w-full">
            <List className="w-4 h-4" />
            그룹 목록
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
