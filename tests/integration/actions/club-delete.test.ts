import { describe, it, expect, beforeEach } from 'vitest';
import { deleteClub } from '@/lib/actions/club-members';
import { admin } from '../helpers/admin';
import { signInAs, signOut } from '../helpers/auth';
import { resetDb, seedUser, seedClub, seedMember } from '../helpers/seed';

async function clubExists(clubId: string): Promise<boolean> {
  const { data } = await admin().from('clubs').select('id').eq('id', clubId).maybeSingle();
  return !!data;
}

describe('deleteClub (RLS-enforced)', () => {
  beforeEach(async () => {
    await resetDb();
    signOut();
  });

  it('A. admin이 호출하면 club 삭제', async () => {
    const adminUser = await seedUser();
    const club = await seedClub('A', adminUser.id);

    await signInAs(adminUser.email, adminUser.password);
    const result = await deleteClub(club.id);

    expect(result.ok).toBe(true);
    expect(await clubExists(club.id)).toBe(false);
  });

  it('B. 일반 member 호출은 거절 + club 보존', async () => {
    const adminUser = await seedUser();
    const member = await seedUser();
    const club = await seedClub('A', adminUser.id);
    await seedMember(club.id, member.id, 'member');

    await signInAs(member.email, member.password);
    const result = await deleteClub(club.id);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('그룹 관리자만 삭제할 수 있어요.');
    expect(await clubExists(club.id)).toBe(true);
  });
});
