import { BellRing, CandyCane, Gift, Snowflake, TreePine, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { SeasonalTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

const memberAvatarRoles = ['member-avatar-primary', 'member-avatar-accent', 'member-avatar-secondary'] as const;

type IconRole = 'book' | 'location' | 'schedule' | 'presenter' | 'home' | 'meetings' | 'members' | 'settings'
  | (typeof memberAvatarRoles)[number];

const seasonalIcons: Record<SeasonalTheme, Partial<Record<IconRole, LucideIcon>>> = {
  christmas: {
    book: TreePine,
    location: CandyCane,
    schedule: BellRing,
    presenter: Snowflake,
    home: TreePine,
    meetings: Gift,
    members: Snowflake,
    settings: BellRing,
    'member-avatar-primary': TreePine,
    'member-avatar-accent': Gift,
    'member-avatar-secondary': Snowflake,
  },
};

export function SeasonalMemberIcon({ memberId, children }: { memberId: string; children: ReactNode }) {
  // The member ID keeps the icon stable across renders and display name changes.
  let hash = 0;
  for (const character of memberId) {
    hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  }
  const role = memberAvatarRoles[hash % memberAvatarRoles.length];
  return <SeasonalIcon iconRole={role} className="size-5">{children}</SeasonalIcon>;
}

export function SeasonalIcon({ iconRole, children, className }: {
  iconRole: IconRole;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span aria-hidden="true" data-slot="seasonal-icon" data-icon-role={iconRole} className="contents">
      <span data-icon-theme="default">{children}</span>
      {Object.entries(seasonalIcons).map(([theme, icons]) => {
        const Icon = icons[iconRole];
        return Icon ? (
          <span key={theme} data-icon-theme={theme}>
            <Icon className={cn('inline-block size-[1em] align-[-0.125em]', className)} />
          </span>
        ) : null;
      })}
    </span>
  );
}
