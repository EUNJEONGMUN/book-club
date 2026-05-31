import { test, expect } from '@playwright/test';

const UNIQUE = Date.now();

test('로그인 → 모임 등록 → 발제문 추가 → 참석 체크', async ({ page }) => {
  // 1. 부트스트랩 admin 계정으로 로그인
  await page.goto('/login');
  await page.getByLabel('이메일').fill('admin@example.com');
  await page.getByLabel('비밀번호').fill('password123');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL('/');

  // 2. 새 모임 등록 (MeetingForm uses Label without htmlFor, so use getByPlaceholder)
  await page.goto('/meetings/new');
  await page.getByPlaceholder('예: 미움받을 용기').fill(`테스트 책 ${UNIQUE}`);
  await page.getByPlaceholder('예: 기시미 이치로').fill('테스트 저자');
  const tomorrow = new Date(Date.now() + 86400000);
  const local = tomorrow.toISOString().slice(0, 16);
  await page.locator('input[type="datetime-local"]').fill(local);
  await page.getByPlaceholder('예: 강남역 스타벅스').fill('테스트 카페');
  await page.getByRole('button', { name: '등록하기' }).click();
  await expect(page).toHaveURL(/\/meetings\/[a-f0-9-]+/);

  // 3. 발제문 추가
  await page.getByRole('button', { name: /질문 추가/ }).click();
  await page.getByPlaceholder('예: 주인공이 마지막에 한 선택에 동의하시나요?').fill('주인공의 선택에 대해 어떻게 생각하시나요?');
  await page.getByRole('button', { name: '등록' }).click();
  await expect(page.getByText('Q1.')).toBeVisible();

  // 4. 참석 체크 (AttendanceToggle renders native <button> elements)
  await page.getByRole('button', { name: '참석' }).first().click();
  await page.reload();
  await expect(page.getByRole('button', { name: '참석' }).first()).toHaveClass(/bg-slate-900/);
});
