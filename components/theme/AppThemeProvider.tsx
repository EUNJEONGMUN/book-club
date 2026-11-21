'use client';

import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

import { DEFAULT_THEME, THEME_OPTIONS } from '@/lib/theme';

export function AppThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="data-theme"
      themes={THEME_OPTIONS.map(({ value }) => value)}
      defaultTheme={DEFAULT_THEME}
      storageKey="book-club-theme"
      enableSystem={false}
      enableColorScheme={false}
    >
      {children}
    </ThemeProvider>
  );
}
