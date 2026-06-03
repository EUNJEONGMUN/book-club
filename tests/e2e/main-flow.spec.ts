import { test, expect } from '@playwright/test';

const UNIQUE = Date.now();

test('로그인 → 모임 등록 → 발제문 추가 → 참석 체크', async ({ page }) => {
  // 1. 부트스트랩 admin 계정으로 로그인
  await page.goto('/login');
  await page.getByLabel('이메일').fill('admin@example.local');
  await page.getByLabel('비밀번호').fill('password123');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL('/');

  // 2. 새 모임 등록 (수동 입력 — book/place search APIs는 외부 의존성)
  await page.goto('/meetings/new');
  await page.getByPlaceholder('예: 데미안').fill(`테스트 책 ${UNIQUE}`);
  await page.getByPlaceholder('예: 헤르만 헤세').fill('테스트 저자');

  // 날짜: 오늘이 prefill 되어 있지만 명시적으로 내일로 설정
  const tomorrow = new Date(Date.now() + 86400000);
  const isoDate = tomorrow.toISOString().slice(0, 10); // YYYY-MM-DD
  await page.locator('input[type="date"]').fill(isoDate);
  // 시간 셀렉트
  await page.locator('select').first().selectOption('19:00');

  await page.getByPlaceholder('예: 아마츄어 작업실').fill('테스트 카페');
  await page.getByRole('button', { name: '저장' }).click();
  await expect(page).toHaveURL(/\/meetings\/[a-f0-9-]+/);

  // 3. 발제문 추가 (호스트로 새 모임을 만들었으므로 + 질문 추가 버튼 노출됨)
  await page.getByRole('button', { name: /질문 추가/ }).click();
  // MarkdownEditor의 textarea
  await page.locator('textarea').first().fill('주인공의 선택에 대해 어떻게 생각하시나요?');
  await page.getByRole('button', { name: '등록' }).click();
  await expect(page.getByText('Q1.')).toBeVisible();

  // 4. 참석 체크는 이제 홈 카드(NextMeetingCard)에서 — 상세 페이지에서 제거됨
  await page.goto('/');
  await page.getByRole('button', { name: '참석' }).first().click();
  await page.reload();
  await expect(page.getByRole('button', { name: '참석' }).first()).toHaveClass(/bg-slate-900|bg-blue/);
});
