import { Bell, Gift, TreePine } from 'lucide-react';
import type { ReactNode } from 'react';
import type { SeasonalTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

type DecorationRole = 'home' | 'bookshelf';

const decorations: Record<SeasonalTheme, Partial<Record<DecorationRole, ReactNode>>> = {
  christmas: {
    home: (
      <>
        <span data-part="ribbon"><span /></span>
        <span data-part="ornament" />
      </>
    ),
    bookshelf: (
      <>
        <Gift />
        <TreePine />
        <Bell />
      </>
    ),
  },
};

export function SeasonalDecoration({ decorationRole, className }: {
  decorationRole: DecorationRole;
  className?: string;
}) {
  return (
    <div aria-hidden="true" data-slot="seasonal-decoration" data-decoration-role={decorationRole} className={cn('hidden', className)}>
      {Object.entries(decorations).map(([theme, themeDecorations]) => {
        const decoration = themeDecorations[decorationRole];
        return decoration ? <span key={theme} className="hidden" data-decoration-theme={theme}>{decoration}</span> : null;
      })}
    </div>
  );
}
