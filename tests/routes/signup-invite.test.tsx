import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ signUp: vi.fn(), push: vi.fn(), createProfile: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: vi.fn() }),
}));
vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowser: () => ({ auth: { signUp: mocks.signUp } }),
}));
vi.mock('@/lib/actions/profile', () => ({ createProfile: mocks.createProfile }));

import { SignupForm } from '@/app/(auth)/signup/signup-form';

it('이메일 인증 링크와 로그인 화면 모두 원래 초대 링크로 돌아올 수 있다', async () => {
  const next = '/join?token=sample-invite';
  mocks.signUp.mockResolvedValue({ data: { user: { id: 'new-user' }, session: null }, error: null });
  render(<SignupForm next={next} />);
  fireEvent.change(screen.getByLabelText('이름'), { target: { value: '신청자' } });
  fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'applicant@example.test' } });
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'local-test-password' } });
  fireEvent.click(screen.getByRole('button', { name: '가입하기' }));

  await waitFor(() => expect(mocks.push).toHaveBeenCalledOnce());
  const callback = new URL(mocks.signUp.mock.calls[0][0].options.emailRedirectTo);
  expect(callback.origin).toBe(window.location.origin);
  expect(callback.pathname).toBe('/auth/callback');
  expect(callback.searchParams.get('next')).toBe(next);
  const login = new URL(mocks.push.mock.calls[0][0], window.location.origin);
  expect(login.pathname).toBe('/login');
  expect(login.searchParams.get('next')).toBe(next);
  expect(mocks.createProfile).not.toHaveBeenCalled();
});
