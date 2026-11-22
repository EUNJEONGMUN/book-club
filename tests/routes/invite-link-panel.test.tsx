import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

const { rotateInvite, revokeInvite, confirmSpy } = vi.hoisted(() => ({
  rotateInvite: vi.fn(),
  revokeInvite: vi.fn(),
  confirmSpy: vi.fn(() => true),
}));
vi.mock('@/lib/actions/club', () => ({ rotateInvite, revokeInvite }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.stubGlobal('confirm', confirmSpy);

import { InviteLinkPanel } from '@/components/club/InviteLinkPanel';

it('만들기 버튼을 눌러 서버가 발급한 토큰의 링크를 보여준다', async () => {
  rotateInvite.mockResolvedValue({ ok: true, invite: { token: 'new-token' } });
  render(<InviteLinkPanel initialInvite={null} />);

  fireEvent.click(screen.getByRole('button', { name: '초대링크 만들기' }));

  expect(await screen.findByText(`${window.location.origin}/join?token=new-token`)).toBeVisible();
  expect(screen.getByRole('button', { name: '폐기' })).toBeVisible();
});

it('폐기 버튼을 누르면 서버에 폐기 요청을 보내고 만들기 UI로 돌아간다', async () => {
  revokeInvite.mockResolvedValue({ ok: true });
  const initialInvite = {
    id: 'invite-id',
    token: 'existing-token',
    created_by: 'admin-id',
    created_at: '2026-11-12T00:00:00Z',
    revoked_at: null,
  };
  render(<InviteLinkPanel initialInvite={initialInvite} />);

  fireEvent.click(screen.getByRole('button', { name: '폐기' }));

  await waitFor(() => expect(revokeInvite).toHaveBeenCalled());
  expect(await screen.findByRole('button', { name: '초대링크 만들기' })).toBeVisible();
});

it('활성 초대 링크의 서버 마크업을 오류 없이 브라우저에서 이어서 렌더링한다', async () => {
  const initialInvite = {
    id: 'invite-id',
    token: 'existing-token',
    created_by: 'admin-id',
    created_at: '2026-11-12T00:00:00Z',
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
