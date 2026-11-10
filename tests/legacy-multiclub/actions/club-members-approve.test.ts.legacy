import { describe, it, expect, beforeEach } from 'vitest';
import { approveMember } from '@/lib/actions/club-members';
import { admin } from '../helpers/admin';
import { signInAs, signOut } from '../helpers/auth';
import { resetDb, seedUser, seedClub, seedMember } from '../helpers/seed';

async function fetchRole(clubId: string, userId: string): Promise<string | null> {
  const { data } = await admin()
    .from('club_members')
    .select('role')
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .single();
  return data?.role ?? null;
}

describe('approveMember (RLS-enforced)', () => {
  beforeEach(async () => {
    await resetDb();
    signOut();
  });

  it('A. admin이 pending을 승인하면 role=member', async () => {
    const adminUser = await seedUser();
    const pending = await seedUser();
    const club = await seedClub('A', adminUser.id);
    await seedMember(club.id, pending.id, 'pending');

    await signInAs(adminUser.email, adminUser.password);
    const result = await approveMember(club.id, pending.id);

    expect(result.ok).toBe(true);
    expect(await fetchRole(club.id, pending.id)).toBe('member');
  });

  it('B. 일반 member 호출은 거절 + DB role 불변', async () => {
    const adminUser = await seedUser();
    const member = await seedUser();
    const pending = await seedUser();
    const club = await seedClub('A', adminUser.id);
    await seedMember(club.id, member.id, 'member');
    await seedMember(club.id, pending.id, 'pending');

    await signInAs(member.email, member.password);
    const result = await approveMember(club.id, pending.id);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('권한이 없거나 이미 처리된 신청입니다.');
    expect(await fetchRole(club.id, pending.id)).toBe('pending');
  });

  it('C. 비-멤버 호출은 거절 + DB role 불변', async () => {
    const adminUser = await seedUser();
    const pending = await seedUser();
    const outsider = await seedUser();
    const club = await seedClub('A', adminUser.id);
    await seedMember(club.id, pending.id, 'pending');

    await signInAs(outsider.email, outsider.password);
    const result = await approveMember(club.id, pending.id);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('권한이 없거나 이미 처리된 신청입니다.');
    expect(await fetchRole(club.id, pending.id)).toBe('pending');
  });

  it('D. 다른 클럽 admin 호출은 거절 (cross-club 격리)', async () => {
    const admin1 = await seedUser();
    const pending = await seedUser();
    const admin2 = await seedUser();
    const clubA = await seedClub('A', admin1.id);
    const clubB = await seedClub('B', admin2.id);
    await seedMember(clubA.id, pending.id, 'pending');

    await signInAs(admin2.email, admin2.password);
    const result = await approveMember(clubA.id, pending.id);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('권한이 없거나 이미 처리된 신청입니다.');
    expect(await fetchRole(clubA.id, pending.id)).toBe('pending');
    // (clubB는 사용 안 했지만 다른 클럽 admin이라는 컨텍스트 셋업용)
  });
});
