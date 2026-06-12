import { describe, it, expect, beforeEach } from 'vitest';
import { getMemberHistoryInClub } from '@/lib/queries/clubs';
import { admin } from '../helpers/admin';
import { signInAs, signOut } from '../helpers/auth';
import { resetDb, seedUser, seedClub, seedMember } from '../helpers/seed';

async function seedMeeting(opts: {
  clubId: string;
  hostId: string;
  bookTitle: string;
  scheduledAt?: string;
}): Promise<{ id: string }> {
  const { data, error } = await admin()
    .from('meetings')
    .insert({
      club_id: opts.clubId,
      host_id: opts.hostId,
      book_title: opts.bookTitle,
      book_author: '저자',
      scheduled_at: opts.scheduledAt ?? new Date(Date.now() + 86_400_000).toISOString(),
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

describe('getMemberHistoryInClub', () => {
  beforeEach(async () => {
    await resetDb();
    signOut();
  });

  it('A. 발제 + 참석 모두 → 발제 우선, 최신순. 다른 클럽 모임은 제외', async () => {
    const adminUser = await seedUser();
    const target = await seedUser();
    const clubA = await seedClub('A', adminUser.id);
    const clubB = await seedClub('B', adminUser.id);
    await seedMember(clubA.id, target.id, 'member');
    await seedMember(clubB.id, target.id, 'member');

    // clubA: target이 host 1개 (2026-06-01), target이 참석만 1개 (2026-07-01)
    const hostMeeting = await seedMeeting({
      clubId: clubA.id, hostId: target.id, bookTitle: '발제 책',
      scheduledAt: '2026-06-01T19:00:00Z',
    });
    const attendMeeting = await seedMeeting({
      clubId: clubA.id, hostId: adminUser.id, bookTitle: '참석 책',
      scheduledAt: '2026-07-01T19:00:00Z',
    });
    await seedAttendance(attendMeeting.id, target.id);

    // clubB: target이 host (다른 클럽 → 제외돼야 함)
    await seedMeeting({
      clubId: clubB.id, hostId: target.id, bookTitle: '다른 클럽 책',
    });

    await signInAs(adminUser.email, adminUser.password);
    const history = await getMemberHistoryInClub(clubA.id, target.id);

    expect(history).toHaveLength(2);
    // 최신순 — 참석 책(7월) 먼저, 발제 책(6월) 다음
    expect(history[0].book_title).toBe('참석 책');
    expect(history[0].is_host).toBe(false);
    expect(history[1].book_title).toBe('발제 책');
    expect(history[1].is_host).toBe(true);

    // hostMeeting + 자기 참석 둘 다 있는 케이스 — 발제 우선
    await seedAttendance(hostMeeting.id, target.id);
    const after = await getMemberHistoryInClub(clubA.id, target.id);
    const hostEntry = after.find((h) => h.meeting_id === hostMeeting.id);
    expect(hostEntry?.is_host).toBe(true);
  });

  it('B. 비-멤버가 다른 클럽 멤버 이력 조회하면 RLS로 빈 결과', async () => {
    const adminUser = await seedUser();
    const target = await seedUser();
    const outsider = await seedUser();
    const club = await seedClub('A', adminUser.id);
    await seedMember(club.id, target.id, 'member');
    const meeting = await seedMeeting({ clubId: club.id, hostId: target.id, bookTitle: '책' });
    await seedAttendance(meeting.id, target.id);

    await signInAs(outsider.email, outsider.password);
    const history = await getMemberHistoryInClub(club.id, target.id);

    expect(history).toHaveLength(0);
  });
});
