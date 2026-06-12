import { describe, it, expect, beforeEach } from 'vitest';
import { getMyClubs, getMyPendingClubs } from '@/lib/queries/clubs';
import { signInAs, signOut } from '../helpers/auth';
import { resetDb, seedUser, seedClub, seedMember } from '../helpers/seed';

describe('getMyPendingClubs', () => {
  beforeEach(async () => {
    await resetDb();
    signOut();
  });

  it('A. pending row가 있는 클럽만 리턴. active는 getMyClubs에서, 분리됨', async () => {
    const me = await seedUser();
    const adminA = await seedUser();
    const adminB = await seedUser();
    const adminC = await seedUser();
    const clubA = await seedClub('A 활성', adminA.id);
    const clubB = await seedClub('B 대기', adminB.id);
    const clubC = await seedClub('C 다른사람만', adminC.id);
    await seedMember(clubA.id, me.id, 'member');
    await seedMember(clubB.id, me.id, 'pending');
    // clubC는 me가 안 속함

    await signInAs(me.email, me.password);
    const [active, pending] = await Promise.all([getMyClubs(), getMyPendingClubs()]);

    expect(active.map((c) => c.name)).toEqual(['A 활성']);
    expect(pending.map((c) => c.name)).toEqual(['B 대기']);
  });

  it('B. 로그인 안 됨 → 빈 결과', async () => {
    const adminA = await seedUser();
    await seedClub('A', adminA.id);
    // signIn 안 함 (beforeEach signOut 상태 그대로)

    const pending = await getMyPendingClubs();
    expect(pending).toEqual([]);
  });
});
