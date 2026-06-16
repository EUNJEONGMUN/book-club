import { describe, it, expect, beforeEach } from 'vitest';
import { admin } from '../helpers/admin';
import { signInAs, signOut } from '../helpers/auth';
import { resetDb, seedUser, seedClub, seedMember } from '../helpers/seed';

describe('get_club_admin_emails RPC', () => {
  beforeEach(async () => {
    await resetDb();
    signOut();
  });

  it('A. admin role 멤버의 이메일만 리턴. member/pending 제외', async () => {
    const adminUser = await seedUser();
    const memberUser = await seedUser();
    const pendingUser = await seedUser();
    const club = await seedClub('A', adminUser.id);
    await seedMember(club.id, memberUser.id, 'member');
    await seedMember(club.id, pendingUser.id, 'pending');

    // signInAs 누구나 — SECURITY DEFINER라 caller auth 무관
    await signInAs(adminUser.email, adminUser.password);

    const { data, error } = await admin().rpc('get_club_admin_emails', {
      target_club_id: club.id,
    });

    expect(error).toBeNull();
    const emails = (data ?? []).map((r: any) => r.email);
    expect(emails).toEqual([adminUser.email]);
  });

  it('B. 다른 클럽 admin은 포함 안 됨 (스코핑)', async () => {
    const a1 = await seedUser();
    const a2 = await seedUser();
    const clubA = await seedClub('A', a1.id);
    await seedClub('B', a2.id);

    await signInAs(a1.email, a1.password);
    const { data } = await admin().rpc('get_club_admin_emails', {
      target_club_id: clubA.id,
    });

    const emails = (data ?? []).map((r: any) => r.email);
    expect(emails).toEqual([a1.email]);
  });
});
