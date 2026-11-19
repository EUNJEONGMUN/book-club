export type BookshelfSearchParams = {
  view?: string | string[];
  year?: string | string[];
};

export function getBookshelfYear({ view, year }: BookshelfSearchParams, fallbackYear?: number) {
  if (view !== 'bookshelf') return undefined;
  return typeof year === 'string' && /^[1-9]\d{3}$/.test(year) ? Number(year) : fallbackYear;
}

export function bookshelfSearch(year?: number) {
  return year === undefined ? '' : `?view=bookshelf&year=${year}`;
}
