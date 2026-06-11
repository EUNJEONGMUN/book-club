import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { admin } from './helpers/admin';
import { signInAs, currentClient, signOut } from './helpers/auth';

describe('integration infra smoke', () => {
  beforeEach(() => signOut());

  it('admin() 클라이언트로 auth.admin.listUsers 호출 성공', async () => {
    const { data, error } = await admin().auth.admin.listUsers();
    expect(error).toBeNull();
    expect(Array.isArray(data?.users)).toBe(true);
  });

  it('signInAs로 user 컨텍스트 전환 → currentClient가 그 user로 인증됨', async () => {
    const email = `${randomUUID()}@test.local`;
    const password = 'test1234';
    const { data: created } = await admin().auth.admin.createUser({
      email, password, email_confirm: true,
    });
    expect(created.user).toBeTruthy();

    await signInAs(email, password);
    const { data: { user } } = await currentClient().auth.getUser();
    expect(user?.email).toBe(email);

    // 정리
    if (created.user) await admin().auth.admin.deleteUser(created.user.id);
  });
});
