import { act, fireEvent, render, screen } from '@testing-library/react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

const { rotateInvite } = vi.hoisted(() => ({ rotateInvite: vi.fn() }));
vi.mock('@/lib/actions/club', () => ({ rotateInvite }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { InviteLinkPanel } from '@/components/club/InviteLinkPanel';

it('발급 결과의 DB 만료 시각을 한국 시간으로 표시한다', async () => {
  const expiresAt = '2026-12-02T18:25:43.987Z';
  rotateInvite.mockResolvedValue({ ok: true, invite: { token: 'new-token', expires_at: expiresAt } });
  render(<InviteLinkPanel initialInvite={null} />);

  fireEvent.click(screen.getByRole('button', { name: '초대링크 만들기' }));

  expect(await screen.findByText(`${window.location.origin}/join?token=new-token`)).toBeVisible();
  const expiry = screen.getByText(/12\.\s+0?3\.\s+03:25$/);
  expect(expiry).toHaveAttribute('datetime', expiresAt);
});

it('활성 초대 링크의 서버 마크업을 오류 없이 브라우저에서 이어서 렌더링한다', async () => {
  const initialInvite = {
    id: 'invite-id',
    token: 'existing-token',
    created_by: 'admin-id',
    created_at: '2026-11-12T00:00:00Z',
    expires_at: '2026-12-12T00:00:00Z',
    revoked_at: null,
  };
  const panel = <InviteLinkPanel initialInvite={initialInvite} />;
  const container = document.createElement('div');
  const onRecoverableError = vi.fn();
  vi.stubGlobal('window', undefined);
  try {
    container.innerHTML = renderToString(panel);
  } finally {
    vi.unstubAllGlobals();
  }

  let root: Root | undefined;
  try {
    await act(async () => {
      root = hydrateRoot(container, panel, { onRecoverableError });
    });
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(container).toHaveTextContent(`${window.location.origin}/join?token=existing-token`);
  } finally {
    await act(async () => root?.unmount());
  }
});
