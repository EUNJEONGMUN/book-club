export const DEFAULT_THEME = 'light';

export const THEME_OPTIONS = [
  { value: DEFAULT_THEME, label: '기본' },
  { value: 'christmas', label: '크리스마스' },
] as const;

export type SeasonalTheme = Exclude<(typeof THEME_OPTIONS)[number]['value'], typeof DEFAULT_THEME>;
