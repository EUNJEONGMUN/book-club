'use client';

import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

export const DEFAULT_THEME = 'light';
export const THEME_OPTIONS = [
  { value: DEFAULT_THEME, label: '기본' },
  { value: 'christmas', label: '크리스마스' },
];

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
