import { BellRing, CandyCane, Gift, Snowflake, TreePine } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const christmasIcons = {
  book: TreePine,
  location: CandyCane,
  home: TreePine,
  meetings: Gift,
  members: Snowflake,
  settings: BellRing,
  'member-tree': TreePine,
  'member-gift': Gift,
  'member-snowflake': Snowflake,
};

const memberIconKinds = ['member-tree', 'member-gift', 'member-snowflake'] as const;

export function SeasonalMemberIcon({ memberId, children }: { memberId: string; children: ReactNode }) {
  // The member ID keeps the icon stable across renders and display name changes.
  let hash = 0;
  for (const character of memberId) {
    hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  }
  const kind = memberIconKinds[hash % memberIconKinds.length];

  return <SeasonalIcon kind={kind} className="size-5">{children}</SeasonalIcon>;
}

export function SeasonalIcon({ kind, children, className }: {
  kind: keyof typeof christmasIcons;
  children: ReactNode;
  className?: string;
}) {
  const ChristmasIcon = christmasIcons[kind];

  return (
    <span aria-hidden="true" className="contents">
      <span className="theme-icon-default contents">{children}</span>
      <span className="theme-icon-christmas hidden">
        <ChristmasIcon className={cn('inline-block size-[1em] align-[-0.125em]', `theme-icon-${kind}`, className)} />
      </span>
    </span>
  );
}
