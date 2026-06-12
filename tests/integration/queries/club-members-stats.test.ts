import { describe, it, expect, beforeEach } from 'vitest';
import { getClubMembersWithStats } from '@/lib/queries/clubs';
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

async function seedAttendance(meetingId: string, userId: string, status: 'attending' | 'absent') {
  const { error } = await admin()
    .from('attendances')
    .insert({ meeting_id: meetingId, user_id: userId, status });
  if (error) throw error;
}

describe('getClubMembersWithStats', () => {
  beforeEach(async () => {
    await resetDb();
    signOut();
  });

  it('A. active 멤버만 (admin + member), pending/outsider 제외, 모임 없을 때 카운트 0', async () => {
    const adminUser = await seedUser();
    const member = await seedUser();
    const pending = await seedUser();
    await seedUser(); // outsider — seeded but not added to club
    const club = await seedClub('A', adminUser.id);
    await seedMember(club.id, member.id, 'member');
    await seedMember(club.id, pending.id, 'pending');

    await signInAs(adminUser.email, adminUser.password);
    const rows = await getClubMembersWithStats(club.id);

    expect(rows).toHaveLength(2);
    const ids = rows.map((r) => r.user_id).sort();
    expect(ids).toEqual([adminUser.id, member.id].sort());
    rows.forEach((r) => {
      expect(r.attended_count).toBe(0);
      expect(r.hosted_count).toBe(0);
    });
    expect(rows.find((r) => r.user_id === adminUser.id)?.role).toBe('admin');
    expect(rows.find((r) => r.user_id === member.id)?.role).toBe('member');
  });

  it('B. host 카운트 + 참석 카운트 정확 (다른 클럽의 모임은 제외)', async () => {
    const adminUser = await seedUser();
    const member = await seedUser();
    const clubA = await seedClub('A', adminUser.id);
    const clubB = await seedClub('B', adminUser.id); // 다른 클럽 (스코핑 검증)
    await seedMember(clubA.id, member.id, 'member');

    // clubA: member host 모임 + adminUser 참석
    const meetingA = await seedMeeting({ clubId: clubA.id, hostId: member.id });
    await seedAttendance(meetingA.id, adminUser.id, 'attending');

    // clubB: adminUser host 모임 — clubA 카운트에 들어가면 안 됨
    await seedMeeting({ clubId: clubB.id, hostId: adminUser.id });

    await signInAs(adminUser.email, adminUser.password);
    const rows = await getClubMembersWithStats(clubA.id);

    const memberRow = rows.find((r) => r.user_id === member.id);
    const adminRow = rows.find((r) => r.user_id === adminUser.id);
    expect(memberRow?.hosted_count).toBe(1);
    expect(memberRow?.attended_count).toBe(0);
    expect(adminRow?.hosted_count).toBe(0); // clubB 호스트는 제외됨
    expect(adminRow?.attended_count).toBe(1);
  });

  it('C. 비-멤버가 호출하면 RLS가 멤버 row 차단해서 빈 결과', async () => {
    const adminUser = await seedUser();
    const member = await seedUser();
    const outsider = await seedUser();
    const club = await seedClub('A', adminUser.id);
    await seedMember(club.id, member.id, 'member');

    await signInAs(outsider.email, outsider.password);
    const rows = await getClubMembersWithStats(club.id);

    expect(rows).toHaveLength(0);
  });
});
