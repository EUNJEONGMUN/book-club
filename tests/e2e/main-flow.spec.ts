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

test('선택한 연도의 지난 모임을 월별 책장에서 보고 목록으로 돌아간다', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/meetings');
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
    if (first) await expect(book).toHaveAttribute('href', first.href);
  }
  await back.click();
  await expect(yearSelect).toHaveValue(selectedYear);
});

test('멤버·설정·프로필을 조회하며 전체 삭제 기능은 제공하지 않는다', async ({ page }) => {
  await page.getByRole('navigation').getByRole('link', { name: '멤버', exact: true }).click();
  await expect(page).toHaveURL('/members');
  await expect(page.getByText(/멤버 \d+명/)).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: '설정', exact: true }).click();
  await expect(page).toHaveURL('/more');
  await expect(page.getByRole('button', { name: '그룹 삭제', exact: true })).toHaveCount(0);
  const links = page.getByRole('link');
  await expect(links.and(page.locator('[href="/more/applicants"]'))).toBeVisible();
  await links.and(page.locator('[href="/more/profile"]')).click();
  await expect(page).toHaveURL('/more/profile');
  await expect(page.getByLabel('이름')).not.toHaveValue('');
});

test('예전 부글부글 주소는 기존 ID의 새 상세 화면으로 연결한다', async ({ page }) => {
  await page.goto('/clubs/10000000-0000-0000-0000-000000000001/meetings/20000000-0000-0000-0000-000000000002');
  await expect(page).toHaveURL('/meetings/20000000-0000-0000-0000-000000000002');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('테마를 즉시 적용하고 새로고침 뒤에도 선택을 복원한다', async ({ page }) => {
  test.slow();
  const nav = page.getByRole('navigation');
  const homeDecoration = page.locator('.home-christmas-decoration');
  await expect(homeDecoration).toBeHidden();
  await nav.getByRole('link', { name: '설정', exact: true }).click();
  await page.getByRole('link', { name: '테마 변경' }).click();
  await expect(page).toHaveURL('/more/theme', { timeout: 15_000 });

  const defaultTheme = page.getByRole('radio', { name: '기본', exact: true });
  const christmas = page.getByRole('radio', { name: '크리스마스', exact: true });
  const header = page.getByRole('banner');
  const body = page.locator('body');
  const seasonalNavIcons = nav.locator('.theme-icon-christmas svg:visible');
  await expect(defaultTheme).toBeChecked();
  await expect(header).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(seasonalNavIcons).toHaveCount(0);
  const defaultBackground = await body.evaluate((element) => getComputedStyle(element).backgroundColor);

  await defaultTheme.focus();
  await defaultTheme.press('ArrowRight');
  await expect(christmas).toBeChecked();
  await expect(header).toHaveCSS('background-color', 'rgb(248, 240, 227)');
  await expect(body).toHaveCSS('background-color', 'rgb(234, 224, 211)');
  await expect(body).toHaveCSS('background-image', /radial-gradient/);
  await expect(seasonalNavIcons).toHaveCount(4);
  await expect(seasonalNavIcons.first()).toHaveCSS('background-image', /repeating-linear-gradient/);
  await expect(nav.locator('.theme-icon-meetings')).toHaveCSS('background-color', 'rgb(124, 68, 75)');
  await expect(nav.locator('.theme-icon-members')).toHaveCSS('background-color', 'rgb(248, 240, 227)');

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(homeDecoration).toBeVisible();

  await nav.getByRole('link', { name: '모임', exact: true }).click();
  await expect(page).toHaveURL('/meetings', { timeout: 15_000 });
  await expect(header).toHaveCSS('background-color', 'rgb(248, 240, 227)');
  const past = await selectYearWithPastMeetings(page);
  await expect(past.locator('.theme-icon-book').first()).toBeVisible();
  await expect(past.locator('.theme-icon-location').first()).toBeVisible();
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
  await expect(page).toHaveURL(/\/meetings\/[a-f0-9-]+$/);
  const back = page.getByRole('link', { name: '모임목록', exact: true });
  await expect(back).toHaveCSS('color', 'rgb(98, 87, 83)');
  await back.click();
  await expect(open).toBeVisible();

  await nav.getByRole('link', { name: '멤버', exact: true }).click();
  await expect(page).toHaveURL('/members', { timeout: 15_000 });
  const memberIcon = page.locator('.theme-member-avatar .theme-icon-christmas svg').first();
  await expect(memberIcon).toBeVisible();
  const assignedIcon = await memberIcon.getAttribute('class');
  await page.reload();
  await expect(memberIcon).toBeVisible();
  expect(await memberIcon.getAttribute('class')).toBe(assignedIcon);

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
  await expect(nav.locator('.theme-icon-default svg:visible')).toHaveCount(4);
  await nav.getByRole('link', { name: '멤버', exact: true }).click();
  await expect(page).toHaveURL('/members', { timeout: 15_000 });
  await expect(page.locator('.theme-member-avatar .theme-icon-christmas svg:visible')).toHaveCount(0);
  await expect(page.locator('.theme-member-avatar .theme-icon-default').first()).toHaveText(/\S/);
});
