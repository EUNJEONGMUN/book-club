import { describe, it, expect, beforeEach } from 'vitest';
import { updateClub } from '@/lib/actions/club-info';
import { admin } from '../helpers/admin';
import { signInAs, signOut } from '../helpers/auth';
import { resetDb, seedUser, seedClub, seedMember } from '../helpers/seed';

async function fetchClubName(clubId: string): Promise<string | null> {
  const { data } = await admin().from('clubs').select('name').eq('id', clubId).maybeSingle();
  return data?.name ?? null;
}

describe('updateClub (RLS-enforced)', () => {
  beforeEach(async () => {
    await resetDb();
    signOut();
  });

  it('A. admin이 호출하면 이름 수정', async () => {
    const adminUser = await seedUser();
    const club = await seedClub('원래 이름', adminUser.id);

    await signInAs(adminUser.email, adminUser.password);
    const result = await updateClub({ clubId: club.id, name: '새 이름', description: '소개' });

    expect(result.ok).toBe(true);
    expect(await fetchClubName(club.id)).toBe('새 이름');
  });

  it('B. 일반 member 호출은 거절 + 이름 불변', async () => {
    const adminUser = await seedUser();
    const member = await seedUser();
    const club = await seedClub('원래 이름', adminUser.id);
    await seedMember(club.id, member.id, 'member');

    await signInAs(member.email, member.password);
    const result = await updateClub({ clubId: club.id, name: '바뀐 이름', description: null });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('그룹 관리자만 정보를 수정할 수 있어요.');
    expect(await fetchClubName(club.id)).toBe('원래 이름');
  });
});
