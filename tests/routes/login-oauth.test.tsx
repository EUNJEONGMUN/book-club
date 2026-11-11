import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ oauth: vi.fn(), search: '' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));
vi.mock('@/lib/supabase/client', () => ({ getSupabaseBrowser: () => ({
  auth: { signInWithOAuth: mocks.oauth, signInWithPassword: vi.fn() },
}) }));
import LoginForm from '@/app/(auth)/login/login-form';

describe('Google 로그인 시작과 재시도 안내', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.search = '';
    mocks.oauth.mockResolvedValue({ error: null });
  });

  it.each([
    '/meetings/original-id?tab=questions',
    '/join?token=sample-invite',
  ])('Google 로그인 요청에 원래 목적지 %s를 전달한다', async (next) => {
    mocks.search = new URLSearchParams({ next }).toString();
    render(<LoginForm clubName="부글부글" />);
    fireEvent.click(screen.getByRole('button', { name: 'Google로 계속하기' }));
    await waitFor(() => expect(mocks.oauth).toHaveBeenCalledOnce());
    const args = mocks.oauth.mock.calls[0][0];
    expect(args.provider).toBe('google');
    const callback = new URL(args.options.redirectTo);
    expect(callback.origin).toBe(window.location.origin);
    expect(callback.pathname).toBe('/auth/callback');
    expect(callback.searchParams.get('next')).toBe(next);
  });

  it('초대받은 사람이 이메일 회원가입을 선택해도 원래 초대 링크를 유지한다', () => {
    const next = '/join?token=sample-invite';
    mocks.search = new URLSearchParams({ next }).toString();
    render(<LoginForm clubName="부글부글" />);
    const href = screen.getByRole('link', { name: '회원가입' }).getAttribute('href')!;
    const signup = new URL(href, window.location.origin);
    expect(signup.pathname).toBe('/signup');
    expect(signup.searchParams.get('next')).toBe(next);
  });

  it('취소 후 같은 모임에 다시 로그인할 수 있다', async () => {
    mocks.search = new URLSearchParams({ error: 'oauth_cancelled', next: '/meetings/original-id' }).toString();
    render(<LoginForm clubName="부글부글" />);
    expect(screen.getByRole('alert')).toHaveTextContent('취소되었습니다');
    fireEvent.click(screen.getByRole('button', { name: 'Google로 계속하기' }));
    await waitFor(() => expect(mocks.oauth).toHaveBeenCalledOnce());
    expect(new URL(mocks.oauth.mock.calls[0][0].options.redirectTo).searchParams.get('next')).toBe('/meetings/original-id');
  });

  it('인증 실패는 안내하되 임의의 오류 문자열은 화면에 반사하지 않는다', () => {
    mocks.search = 'error=oauth_callback_failed';
    const rendered = render(<LoginForm clubName="부글부글" />);
    expect(screen.getByRole('alert')).toHaveTextContent('다시 시도해주세요');
    rendered.unmount();
    mocks.search = 'error=private_provider_detail';
    render(<LoginForm clubName="부글부글" />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('private_provider_detail')).not.toBeInTheDocument();
  });
});
