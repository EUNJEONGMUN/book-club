import { describe, it, expect, beforeEach } from 'vitest';
import { rejectMember } from '@/lib/actions/club-members';
import { admin } from '../helpers/admin';
import { signInAs, signOut } from '../helpers/auth';
import { resetDb, seedUser, seedClub, seedMember } from '../helpers/seed';

async function fetchRoleOrNull(clubId: string, userId: string): Promise<string | null> {
  const { data } = await admin()
    .from('club_members')
    .select('role')
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .maybeSingle();
  return data?.role ?? null;
}

describe('rejectMember (RLS-enforced)', () => {
  beforeEach(async () => {
    await resetDb();
    signOut();
  });

  it('A. admin이 pending을 거절하면 row 삭제', async () => {
    const adminUser = await seedUser();
    const pending = await seedUser();
    const club = await seedClub('A', adminUser.id);
    await seedMember(club.id, pending.id, 'pending');

    await signInAs(adminUser.email, adminUser.password);
    const result = await rejectMember(club.id, pending.id);

    expect(result.ok).toBe(true);
    expect(await fetchRoleOrNull(club.id, pending.id)).toBeNull();
  });

  it('B. 일반 member 호출은 거절 + DB 불변', async () => {
    const adminUser = await seedUser();
    const member = await seedUser();
    const pending = await seedUser();
    const club = await seedClub('A', adminUser.id);
    await seedMember(club.id, member.id, 'member');
    await seedMember(club.id, pending.id, 'pending');

    await signInAs(member.email, member.password);
    const result = await rejectMember(club.id, pending.id);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('권한이 없거나 이미 처리된 신청입니다.');
    expect(await fetchRoleOrNull(club.id, pending.id)).toBe('pending');
  });
});
