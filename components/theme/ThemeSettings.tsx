'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { DEFAULT_THEME, THEME_OPTIONS } from '@/lib/theme';

const subscribe = () => () => {};

export function ThemeSettings() {
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  const { theme, setTheme } = useTheme();
  const selected = ready && THEME_OPTIONS.some(({ value }) => value === theme)
    ? theme
    : DEFAULT_THEME;

  return (
    <fieldset disabled={!ready} className="min-w-0">
      <legend className="sr-only">테마</legend>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-2 rounded-2xl border border-border bg-card p-3 shadow-sm">
        {THEME_OPTIONS.map(({ value, label }) => (
          <label
            key={value}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-foreground has-checked:border-primary has-checked:bg-accent has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary"
          >
            <input
              type="radio"
              name="book-club-theme"
              value={value}
              checked={selected === value}
              onChange={() => setTheme(value)}
              className="size-4 shrink-0 accent-primary"
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
