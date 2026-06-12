import { describe, it, expect, beforeEach } from 'vitest';
import { getMyStatsInClub } from '@/lib/queries/clubs';
import { admin } from '../helpers/admin';
import { signInAs, signOut } from '../helpers/auth';
import { resetDb, seedUser, seedClub, seedMember } from '../helpers/seed';

async function seedMeeting(opts: { clubId: string; hostId: string }): Promise<{ id: string }> {
  const { data, error } = await admin()
    .from('meetings')
    .insert({
      club_id: opts.clubId,
      host_id: opts.hostId,
      book_title: '책',
      book_author: '저자',
      scheduled_at: new Date(Date.now() + 86_400_000).toISOString(),
      location_name: '강남역',
    })
    .select('id')
    .single();
  if (error || !data) throw error ?? new Error('seedMeeting 실패');
  return { id: data.id };
}

async function seedAttendance(meetingId: string, userId: string) {
  const { error } = await admin()
    .from('attendances')
    .insert({ meeting_id: meetingId, user_id: userId, status: 'attending' });
  if (error) throw error;
}

describe('getMyStatsInClub', () => {
  beforeEach(async () => {
    await resetDb();
    signOut();
  });

  it('A. 발제 + 참석 카운트 정확. 다른 클럽 모임은 제외 (스코핑)', async () => {
    const me = await seedUser();
    const otherAdmin = await seedUser();
    const clubA = await seedClub('A', me.id);
    const clubB = await seedClub('B', otherAdmin.id);
    await seedMember(clubB.id, me.id, 'member');

    // clubA: 본인 host 2개 + 본인 참석 1개 (다른 host)
    await seedMeeting({ clubId: clubA.id, hostId: me.id });
    await seedMeeting({ clubId: clubA.id, hostId: me.id });
    const mA3 = await seedMeeting({ clubId: clubA.id, hostId: me.id });
    await seedAttendance(mA3.id, me.id); // 본인 발제 + 본인 참석 — 발제만 카운트 (참석은 attendances 따로)

    // clubB: 본인 host 1개 + 본인 참석 1개 — clubA 통계에 들어가면 안 됨
    const mB = await seedMeeting({ clubId: clubB.id, hostId: me.id });
    await seedAttendance(mB.id, me.id);

    await signInAs(me.email, me.password);
    const statsA = await getMyStatsInClub(clubA.id);

    expect(statsA).not.toBeNull();
    expect(statsA?.user_id).toBe(me.id);
    expect(statsA?.hosted_count).toBe(3); // clubA 발제만
    expect(statsA?.attended_count).toBe(1); // clubA의 attendances 한 건만
  });

  it('B. 로그인 X → null', async () => {
    const adminUser = await seedUser();
    const club = await seedClub('A', adminUser.id);
    // signOut 상태

    const stats = await getMyStatsInClub(club.id);
    expect(stats).toBeNull();
  });
});
