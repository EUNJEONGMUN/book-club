export type BookshelfSearchParams = {
  view?: string | string[];
  year?: string | string[];
};

export type MeetingDetailSearchParams = BookshelfSearchParams & {
  from?: string | string[];
};

export const meetingFromHomeSearch = '?from=home';

export function getBookshelfYear({ view, year }: BookshelfSearchParams, fallbackYear?: number) {
  if (view !== 'bookshelf') return undefined;
  return typeof year === 'string' && /^[1-9]\d{3}$/.test(year) ? Number(year) : fallbackYear;
}

export function bookshelfSearch(year?: number) {
  if (year === undefined || !Number.isInteger(year) || year < 1000 || year > 9999) return '';
  return `?view=bookshelf&year=${year}`;
}

export function getMeetingDetailNavigation(params: MeetingDetailSearchParams, listYear?: number) {
  const fromHome = params.from === 'home';
  const bookshelfYear = fromHome ? undefined : getBookshelfYear(params, listYear);
  return { fromHome, bookshelfYear, search: fromHome ? meetingFromHomeSearch : bookshelfSearch(bookshelfYear) };
}
