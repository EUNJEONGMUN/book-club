import { test, expect } from '@playwright/test';

// Read-only browser regression: never create/delete records or change attendance.
test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('이메일').fill('admin@example.local');
  await page.getByLabel('비밀번호').fill('password123');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL('/');
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
  const past = page.locator('section').filter({ has: page.getByRole('heading', { name: '지난 모임', exact: true }) });
  await past.getByRole('link').first().click();
  // The local dev server compiles the detail route on its first visit.
  await expect(page).toHaveURL(/\/meetings\/[a-f0-9-]+$/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '한줄 평', exact: true })).toBeVisible();
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
