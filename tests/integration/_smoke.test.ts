import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { admin } from './helpers/admin';
import { signInAs, currentClient, signOut } from './helpers/auth';
import { resetDb, seedUser, seedClub, seedMember, seedInvite } from './helpers/seed';

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

  it('resetDb + seedUser + seedClub + seedMember + seedInvite 풀 체인', async () => {
    await resetDb();

    const adminUser = await seedUser();
    const member = await seedUser();
    const pending = await seedUser();
    expect(adminUser.id).toBeTruthy();
    expect(adminUser.email).toMatch(/@test\.local$/);

    const club = await seedClub('스모크 모임', adminUser.id);
    expect(club.id).toBeTruthy();
    expect(club.name).toBe('스모크 모임');

    await seedMember(club.id, member.id, 'member');
    await seedMember(club.id, pending.id, 'pending');

    const { data: rows } = await admin()
      .from('club_members')
      .select('user_id, role')
      .eq('club_id', club.id);
    expect(rows).toHaveLength(3);

    const token = await seedInvite(club.id, adminUser.email, adminUser.password);
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(10);

    await resetDb();
    const { data: after } = await admin().from('clubs').select('id').eq('id', club.id);
    expect(after).toHaveLength(0);
  });
});
