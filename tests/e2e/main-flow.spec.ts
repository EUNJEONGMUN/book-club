import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

function pastMeetings(page: Page) {
  return page.locator('section').filter({ has: page.getByRole('heading', { name: '지난 모임', exact: true }) });
}

async function selectYearWithPastMeetings(page: Page) {
  const past = pastMeetings(page);
  const yearSelect = past.getByRole('combobox', { name: '지난 모임 연도' });
  await expect(yearSelect).toBeVisible();
  // The seeded past record can be in the previous year when running in January.
  if (await past.locator('a[href^="/meetings/"]').count() === 0) {
    await yearSelect.selectOption({ index: await yearSelect.getByRole('option').count() - 1 });
    await expect(past.locator('a[href^="/meetings/"]').first()).toBeVisible();
  }
  return past;
}

// Read-only browser regression: never create/delete records or change attendance.
test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('이메일').fill('admin@example.local');
  await page.getByLabel('비밀번호').fill('password123');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL('/', { timeout: 15_000 });
});

test('로그인 후 그룹 선택 없이 홈과 고정 메뉴를 이용한다', async ({ page }) => {
  await expect(page.getByRole('heading', { name: /안녕하세요/ })).toBeVisible();
  for (const [name, href] of [['홈','/'],['모임','/meetings'],['멤버','/members'],['설정','/more']]) {
    await expect(page.getByRole('navigation').getByRole('link', { name, exact: true })).toHaveAttribute('href', href);
  }
  await expect(page.getByRole('button', { name: /새 그룹|그룹 만들기/ })).toHaveCount(0);
});

test('홈에서 연 모임 상세는 홈으로 돌아가고 수정 취소 후에도 출발 경로를 유지한다', async ({ page }) => {
  test.slow();
  await expect(page.getByRole('heading', { name: /안녕하세요/ })).toBeVisible();
  const homeDetail = page.getByRole('link', { name: /상세 정보/ });
  const editableDetail = '/meetings/20000000-0000-0000-0000-000000000002';
  if (await homeDetail.isVisible()) {
    await expect(homeDetail).toHaveAttribute('href', /\?from=home$/);
    await homeDetail.click();
  } else {
    // The seeded upcoming meeting eventually becomes a past meeting.
    await page.goto(`${editableDetail}?from=home`);
  }
  await expect(page).toHaveURL(/\/meetings\/[a-f0-9-]+\?from=home$/);
  const backHome = page.getByRole('link', { name: '홈으로', exact: true });
  await expect(backHome).toHaveCSS('min-height', '44px');
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true,
      value: async (url: string) => { document.documentElement.dataset.copiedMeetingUrl = url; },
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: ({ url }: ShareData) => {
        document.documentElement.dataset.sharedMeetingUrl = url;
        return new Promise<void>(() => {});
      },
    });
  });
  const shareButton = page.getByRole('button', { name: '모임 링크 공유', exact: true });
  await expect(shareButton).toHaveCSS('min-height', '44px');
  await shareButton.click();
  const meetingUrl = page.url().split('?')[0];
  await expect(page.locator('html')).toHaveAttribute('data-copied-meeting-url', meetingUrl);
  await expect(page.locator('html')).toHaveAttribute('data-shared-meeting-url', meetingUrl);
  await expect(page.getByText('모임 링크를 복사했어요')).toBeVisible();
  await backHome.click();
  await expect(page).toHaveURL('/');

  await page.goto(`${editableDetail}?from=home`);
  await page.getByRole('button', { name: '모임 메뉴' }).click();
  await expect(page.getByRole('menuitem', { name: /공유|복사/ })).toHaveCount(0);
  await page.getByRole('menuitem', { name: '모임 정보 수정' }).click();
  await expect(page).toHaveURL(`${editableDetail}/edit?from=home`);
  await page.getByRole('link', { name: '취소', exact: true }).click();
  await expect(page).toHaveURL(`${editableDetail}?from=home`);
  await backHome.click();
  await expect(page).toHaveURL('/');
});

test('기존 지난 모임을 새 주소에서 읽을 수 있다', async ({ page }) => {
  await page.getByRole('navigation').getByRole('link', { name: '모임', exact: true }).click();
  await expect(page).toHaveURL('/meetings');
  const past = await selectYearWithPastMeetings(page);
  const yearSelect = past.getByRole('combobox', { name: '지난 모임 연도' });
  const year = await yearSelect.inputValue();
  await past.locator('a[href^="/meetings/"]').first().click();
  // The local dev server compiles the detail route on its first visit.
  await expect(page).toHaveURL(/\/meetings\/[a-f0-9-]+$/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '한줄 평', exact: true })).toBeVisible();
  const back = page.getByRole('link', { name: '모임목록', exact: true });
  await back.click();
  await expect(yearSelect).toHaveValue(year);
});

test('새 모임 작성 취소는 입력 내용이 있을 때 확인하고 출발 화면으로 돌아간다', async ({ page }) => {
  test.slow();
  const dialog = page.getByRole('dialog', { name: '모임 등록을 취소할까요?' });
  const cancelLink = page.getByRole('link', { name: '취소', exact: true });
  const cancelButton = page.getByRole('button', { name: '취소', exact: true });
  const continueWriting = dialog.getByRole('button', { name: '계속 작성' });
  const title = page.getByLabel('책 제목', { exact: true });
  const time = page.getByRole('combobox', { name: '시간', exact: true });
  const yearSelect = page.getByRole('combobox', { name: '지난 모임 연도' });

  await page.goto('/meetings/new');
  await expect(cancelLink).toHaveCSS('height', '44px');
  await cancelLink.click();
  await expect(page).toHaveURL('/meetings');
  await expect(dialog).toHaveCount(0);

  const year = (await yearSelect.getByRole('option').last().getAttribute('value'))!;
  if (await yearSelect.inputValue() !== year) {
    await yearSelect.selectOption(year);
    await expect(page).toHaveURL(`/meetings?year=${year}`);
  }
  const createFromList = page.getByRole('link', { name: '신규 생성' });
  await expect(createFromList).toHaveAttribute('href', `/meetings/new?year=${year}`);
  await createFromList.click();
  await expect(page).toHaveURL(`/meetings/new?year=${year}`);
  await title.fill('작성 중인 책');
  await cancelButton.click();
  await expect(dialog).toBeVisible();
  await continueWriting.click();
  await expect(dialog).toBeHidden();
  await expect(cancelButton).toBeFocused();
  await expect(title).toHaveValue('작성 중인 책');
  await cancelButton.click();
  await dialog.getByRole('link', { name: '작성 취소' }).click();
  await expect(page).toHaveURL(`/meetings?year=${year}`);
  await expect(yearSelect).toHaveValue(year);

  await page.goto('/');
  const createFromHome = page.getByRole('link', { name: '모임 만들기' });
  if (await createFromHome.isVisible()) {
    await createFromHome.click();
  } else {
    // The home button only renders when there is no upcoming meeting.
    await page.goto('/meetings/new?from=home');
  }
  await expect(page).toHaveURL('/meetings/new?from=home');
  const defaultTime = await time.inputValue();
  await time.selectOption('14:00');
  await cancelButton.click();
  await expect(dialog).toBeVisible();
  await continueWriting.click();
  await expect(time).toHaveValue('14:00');
  await time.selectOption(defaultTime);
  await expect(cancelLink).toBeVisible();
  const placeSearch = page.getByRole('textbox', { name: '장소명으로 검색' });
  await placeSearch.fill('모임 장소');
  await cancelButton.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('link', { name: '작성 취소' }).click();
  await expect(page).toHaveURL('/');
});

test('책에서 모임 상세를 열고 같은 연도의 책장과 목록으로 돌아간다', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/meetings');
  await expect(page.getByRole('link', { name: '신규 생성' })).toHaveCSS('min-height', '44px');
  const yearSelect = page.getByRole('combobox', { name: '지난 모임 연도' });
  const year = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Seoul', year: 'numeric' }).format(new Date());
  await expect(yearSelect).toHaveValue(year);
  const past = await selectYearWithPastMeetings(page);
  const selectedYear = await yearSelect.inputValue();
  const meetings = await past.locator('a[href^="/meetings/"]').evaluateAll((links) =>
    links.map((link) => ({
      href: (link as HTMLAnchorElement).pathname,
      date: (link.querySelector('time') as HTMLTimeElement).dateTime,
    })),
  );
  const monthFormatter = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Seoul', month: 'numeric' });
  const monthLabels = new Intl.DateTimeFormat('en', { timeZone: 'UTC', month: 'long' });

  const open = page.getByRole('link', { name: '모아보기', exact: true });
  await expect(open.locator('svg.lucide-book-open')).toBeVisible();
  await open.click();
  const title = page.getByRole('heading', { level: 1, name: selectedYear, exact: true });
  await expect(title).toBeVisible();
  const back = page.getByRole('link', { name: '모임목록', exact: true });
  const titleBounds = await title.boundingBox();
  const backBounds = await back.boundingBox();
  expect(backBounds!.x + backBounds!.width).toBeLessThan(titleBounds!.x);
  await expect(page.getByRole('main').locator('svg.lucide-bell:visible')).toHaveCount(0);
  const bookshelf = page.getByRole('list', { name: '월별 함께 읽은 책' });
  await expect(bookshelf).toHaveCSS('display', 'grid');
  await expect(bookshelf).toHaveCSS('grid-template-columns', /^\S+ \S+ \S+$/);
  await expect(bookshelf).toHaveCSS('grid-template-rows', /^\S+ \S+ \S+ \S+$/);
  await expect(bookshelf.getByRole('heading', { level: 2 })).toHaveCount(12);
  const shelfBounds = await bookshelf.boundingBox();
  const navBounds = await page.getByRole('navigation').boundingBox();
  expect(shelfBounds!.y + shelfBounds!.height).toBeLessThan(navBounds!.y);
  for (let month = 1; month <= 12; month++) {
    const cell = bookshelf.locator(':scope > li').nth(month - 1);
    const label = monthLabels.format(Date.UTC(2026, month - 1, 1));
    await expect(cell.getByRole('heading', { name: new RegExp(`^${label}$`, 'i') })).toBeVisible();
    const first = meetings
      .filter((meeting) => Number(monthFormatter.format(new Date(meeting.date))) === month)
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))[0];
    const book = cell.getByRole('link');
    await expect(book).toHaveCount(first ? 1 : 0);
    if (first) await expect(book).toHaveAttribute('href', `${first.href}?view=bookshelf&year=${selectedYear}`);
  }
  await bookshelf.getByRole('link').first().click();
  await expect(page).toHaveURL(/\/meetings\/[a-f0-9-]+\?view=bookshelf&year=\d{4}$/);
  await page.reload();
  const detailUrl = page.url();
  await page.getByRole('button', { name: '모임 메뉴' }).click();
  await page.getByRole('menuitem', { name: '모임 정보 수정' }).click();
  await expect(page).toHaveURL(/\/edit\?view=bookshelf&year=\d{4}$/);
  await page.getByRole('link', { name: '취소', exact: true }).click();
  await expect(page).toHaveURL(detailUrl);
  const backToBookshelf = page.getByRole('link', { name: '책 모아보기', exact: true });
  await expect(backToBookshelf).toHaveAttribute('href', `/meetings?year=${selectedYear}&view=bookshelf`);
  await backToBookshelf.click();
  await expect(bookshelf).toBeVisible();
  await expect(title).toBeVisible();
  await back.click();
  await expect(yearSelect).toHaveValue(selectedYear);
});

test('멤버·설정·프로필을 조회하며 전체 삭제 기능은 제공하지 않는다', async ({ page }) => {
  test.slow();
  await page.getByRole('navigation').getByRole('link', { name: '멤버', exact: true }).click();
  await expect(page).toHaveURL('/members');
  await expect(page.getByText(/멤버 \d+명/)).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: '설정', exact: true }).click();
  await expect(page).toHaveURL('/more');
  await expect(page.getByRole('button', { name: '그룹 삭제', exact: true })).toHaveCount(0);
  const main = page.getByRole('main');
  const back = main.getByRole('link', { name: '설정', exact: true });
  for (const [path, name] of [
    ['/more/info', /그룹 설정/],
    ['/more/applicants', /가입 신청자/],
    ['/more/theme', /테마 변경/],
    ['/more/profile', /^프로필$/],
  ] as const) {
    await main.getByRole('link').and(page.locator(`[href="${path}"]`)).click();
    await expect(page).toHaveURL(path);
    const heading = main.getByRole('heading', { level: 1, name });
    await expect(heading).toBeVisible();
    await expect(back).toHaveAttribute('href', '/more');
    await expect(back).toHaveCSS('min-height', '44px');
    expect((await back.boundingBox())!.y).toBeLessThan((await heading.boundingBox())!.y);
    if (path === '/more/profile') await expect(main.getByLabel('이름')).not.toHaveValue('');
    await back.click();
    await expect(page).toHaveURL('/more');
  }
});

test('예전 부글부글 주소는 기존 ID의 새 상세 화면으로 연결한다', async ({ page }) => {
  await page.goto('/clubs/10000000-0000-0000-0000-000000000001/meetings/20000000-0000-0000-0000-000000000002');
  await expect(page).toHaveURL('/meetings/20000000-0000-0000-0000-000000000002');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('테마를 즉시 적용하고 새로고침 뒤에도 선택을 복원한다', async ({ page }) => {
  test.slow();
  const nav = page.getByRole('navigation');
  const homeDecoration = page.locator('[data-decoration-role="home"]');
  await expect(homeDecoration).toBeHidden();
  await nav.getByRole('link', { name: '설정', exact: true }).click();
  await page.getByRole('link', { name: '테마 변경' }).click();
  await expect(page).toHaveURL('/more/theme', { timeout: 15_000 });

  const defaultTheme = page.getByRole('radio', { name: '기본', exact: true });
  const christmas = page.getByRole('radio', { name: '크리스마스', exact: true });
  const header = page.getByRole('banner');
  const body = page.locator('body');
  const seasonalNavIcons = nav.locator('[data-icon-theme="christmas"] svg:visible');
  await expect(defaultTheme).toBeChecked();
  await expect(header).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(seasonalNavIcons).toHaveCount(0);
  const defaultBackground = await body.evaluate((element) => getComputedStyle(element).backgroundColor);

  async function navLayout(width: number) {
    await page.setViewportSize({ width, height: 844 });
    return nav.evaluate((element) => [element, ...element.querySelectorAll('a, [data-part="nav-icon"], [data-part="nav-label"]')]
      .map((part) => {
        const { x, y, width, height } = part.getBoundingClientRect();
        return [x, y, width, height];
      }));
  }
  const defaultMobileNav = await navLayout(390);
  const defaultDesktopNav = await navLayout(900);

  await defaultTheme.focus();
  await defaultTheme.press('ArrowRight');
  await expect(christmas).toBeChecked();
  expect(await navLayout(900)).toEqual(defaultDesktopNav);
  expect(await navLayout(390)).toEqual(defaultMobileNav);
  await expect(header).toHaveCSS('background-color', 'rgb(248, 240, 227)');
  await expect(body).toHaveCSS('background-color', 'rgb(234, 224, 211)');
  await expect(body).toHaveCSS('background-image', /radial-gradient/);
  await expect(seasonalNavIcons).toHaveCount(4);
  await expect(nav.locator('[data-part="nav-icon"]').first()).toHaveCSS('background-image', /repeating-linear-gradient/);
  await expect(nav.locator('[data-part="nav-icon"]:has([data-icon-role="meetings"])')).toHaveCSS('background-color', 'rgb(124, 68, 75)');
  await expect(nav.locator('[data-part="nav-icon"]:has([data-icon-role="members"])')).toHaveCSS('background-color', 'rgb(248, 240, 227)');

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(homeDecoration).toBeVisible();

  await nav.getByRole('link', { name: '모임', exact: true }).click();
  await expect(page).toHaveURL('/meetings', { timeout: 15_000 });
  await expect(header).toHaveCSS('background-color', 'rgb(248, 240, 227)');
  const past = await selectYearWithPastMeetings(page);
  await expect(past.locator('[data-icon-role="book"] [data-icon-theme="christmas"] svg').first()).toBeVisible();
  await expect(past.locator('[data-icon-role="location"] [data-icon-theme="christmas"] svg').first()).toBeVisible();
  const open = past.getByRole('link', { name: '모아보기', exact: true });
  await expect(open).toHaveCSS('border-top-color', 'rgb(214, 198, 183)');
  await open.click();
  const bookshelf = page.getByRole('list', { name: '월별 함께 읽은 책' });
  await expect(bookshelf).toHaveCSS('display', 'grid');
  await expect(header).toHaveCSS('background-color', 'rgb(248, 240, 227)');
  await expect(page.getByRole('main').locator('svg.lucide-bell:visible')).toHaveCount(1);
  await expect(bookshelf.getByRole('heading', { name: /^january$/i })).toHaveCSS('color', 'rgb(124, 68, 75)');
  await expect(bookshelf.getByRole('heading', { name: /^february$/i })).toHaveCSS('color', 'rgb(64, 86, 72)');
  await bookshelf.getByRole('link').first().click();
  await expect(page).toHaveURL(/\/meetings\/[a-f0-9-]+\?view=bookshelf&year=\d{4}$/);
  const back = page.getByRole('link', { name: '책 모아보기', exact: true });
  await expect(back).toHaveCSS('color', 'rgb(98, 87, 83)');
  await back.click();
  await expect(bookshelf).toBeVisible();

  await nav.getByRole('link', { name: '멤버', exact: true }).click();
  await expect(page).toHaveURL('/members', { timeout: 15_000 });
  const memberIcon = page.locator('[data-slot="member-avatar"] [data-icon-theme="christmas"] svg').first();
  await expect(memberIcon).toBeVisible();
  const avatar = page.locator('[data-slot="member-avatar"] [data-icon-role]').first();
  const assignedIcon = await avatar.getAttribute('data-icon-role');
  await page.reload();
  await expect(memberIcon).toBeVisible();
  await expect(avatar).toHaveAttribute('data-icon-role', assignedIcon!);

  await nav.getByRole('link', { name: '설정', exact: true }).click();
  await page.getByRole('link', { name: '테마 변경' }).click();
  await expect(page).toHaveURL('/more/theme', { timeout: 15_000 });
  await page.reload();
  await expect(christmas).toBeChecked();
  await expect(header).toHaveCSS('background-color', 'rgb(248, 240, 227)');

  await defaultTheme.check();
  await expect(header).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page.reload();
  await expect(defaultTheme).toBeChecked();
  await expect(header).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(body).toHaveCSS('background-color', defaultBackground);
  await expect(body).toHaveCSS('background-image', 'none');
  await expect(seasonalNavIcons).toHaveCount(0);
  await expect(nav.locator('[data-icon-theme="default"] svg:visible')).toHaveCount(4);
  await nav.getByRole('link', { name: '멤버', exact: true }).click();
  await expect(page).toHaveURL('/members', { timeout: 15_000 });
  await expect(page.locator('[data-slot="member-avatar"] [data-icon-theme="christmas"] svg:visible')).toHaveCount(0);
  await expect(page.locator('[data-slot="member-avatar"] [data-icon-theme="default"]').first()).toHaveText(/\S/);
});


test('모임 등록과 수정에서 일정 입력이 활성 테마를 따른다', async ({ page }) => {
  test.slow();
  await page.setViewportSize({ width: 320, height: 568 });
  const schedule = page.getByRole('region', { name: '일정 (한국 시간)' });
  const date = schedule.getByLabel('날짜', { exact: true });
  const time = schedule.getByRole('combobox', { name: '시간', exact: true });
  const calendar = schedule.locator('[data-icon-role="schedule"] [data-icon-theme="default"] svg');
  const bell = schedule.locator('[data-icon-role="schedule"] [data-icon-theme="christmas"] svg');

  await page.goto('/meetings/new');
  await expect(calendar).toBeVisible();
  await expect(bell).toBeHidden();
  await expect(date).toHaveCSS('background-color', 'rgb(250, 250, 249)');
  await expect(time).toHaveCSS('background-color', 'rgb(250, 250, 249)');
  await expect(date).toHaveAttribute('id', /^meeting-schedule-date-/);
  await expect(time).toHaveAttribute('id', /^meeting-schedule-time-/);

  await page.goto('/more/theme');
  await page.getByRole('radio', { name: '크리스마스', exact: true }).check();

  for (const route of ['/meetings/new', '/meetings/20000000-0000-0000-0000-000000000001/edit']) {
    await page.goto(route);
    await expect(schedule).toHaveCSS('background-color', 'rgb(255, 250, 242)');
    await expect(date).toHaveCSS('background-color', 'rgb(248, 240, 227)');
    await expect(time).toHaveCSS('background-color', 'rgb(248, 240, 227)');
    await expect(time).toHaveCSS('border-top-color', 'rgb(163, 144, 129)');
    await expect(calendar).toBeHidden();
    await expect(bell).toBeVisible();
    const dateBox = await date.boundingBox();
    const timeBox = await time.boundingBox();
    expect(dateBox!.x + dateBox!.width).toBeLessThan(timeBox!.x);
    expect(timeBox!.x + timeBox!.width).toBeLessThanOrEqual(320);
  }
});
