import { describe, it, expect, beforeEach } from 'vitest';
import { setAttendanceFor, deleteAttendance } from '@/lib/actions/attendance';
import { admin } from '../helpers/admin';
import { signInAs, signOut } from '../helpers/auth';
import { resetDb, seedUser, seedClub, seedMember } from '../helpers/seed';

async function seedMeeting(opts: { clubId: string; hostId: string; past: boolean }): Promise<{ id: string }> {
  const offset = opts.past ? -86_400_000 : 86_400_000;
  const { data, error } = await admin()
    .from('meetings')
    .insert({
      club_id: opts.clubId,
      host_id: opts.hostId,
      book_title: '책',
      book_author: '저자',
      scheduled_at: new Date(Date.now() + offset).toISOString(),
      location_name: '강남역',
    })
    .select('id').single();
  if (error || !data) throw error ?? new Error('seedMeeting failed');
  return { id: data.id };
}

async function fetchStatus(meetingId: string, userId: string): Promise<string | null> {
  const { data } = await admin()
    .from('attendances')
    .select('status')
    .eq('meeting_id', meetingId)
    .eq('user_id', userId)
    .maybeSingle();
  return data?.status ?? null;
}

describe('setAttendanceFor', () => {
  beforeEach(async () => {
    await resetDb();
    signOut();
  });

  it('A. 본인 + 미래 모임 → 성공', async () => {
    const member = await seedUser();
    const adminUser = await seedUser();
    const club = await seedClub('A', adminUser.id);
    await seedMember(club.id, member.id, 'member');
    const meeting = await seedMeeting({ clubId: club.id, hostId: adminUser.id, past: false });

    await signInAs(member.email, member.password);
    const r = await setAttendanceFor(meeting.id, member.id, 'attending');

    expect(r.ok).toBe(true);
    expect(await fetchStatus(meeting.id, member.id)).toBe('attending');
  });

  it('B. 본인 + 지난 모임 + 일반 member → 거절', async () => {
    const member = await seedUser();
    const adminUser = await seedUser();
    const club = await seedClub('A', adminUser.id);
    await seedMember(club.id, member.id, 'member');
    const meeting = await seedMeeting({ clubId: club.id, hostId: adminUser.id, past: true });

    await signInAs(member.email, member.password);
    const r = await setAttendanceFor(meeting.id, member.id, 'attending');

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe('지난 모임의 참석 여부는 호스트나 관리자만 수정할 수 있어요.');
    }
    expect(await fetchStatus(meeting.id, member.id)).toBeNull();
  });

  it('C. 호스트가 지난 모임 다른 멤버 정정 → 성공', async () => {
    const hostUser = await seedUser();
    const member = await seedUser();
    const adminUser = await seedUser();
    const club = await seedClub('A', adminUser.id);
    await seedMember(club.id, hostUser.id, 'member');
    await seedMember(club.id, member.id, 'member');
    const meeting = await seedMeeting({ clubId: club.id, hostId: hostUser.id, past: true });

    await signInAs(hostUser.email, hostUser.password);
    const r = await setAttendanceFor(meeting.id, member.id, 'attending');

    expect(r.ok).toBe(true);
    expect(await fetchStatus(meeting.id, member.id)).toBe('attending');
  });

  it('D. admin이 지난 모임 다른 멤버 정정 → 성공', async () => {
    const adminUser = await seedUser();
    const member = await seedUser();
    const hostUser = await seedUser();
    const club = await seedClub('A', adminUser.id);
    await seedMember(club.id, member.id, 'member');
    await seedMember(club.id, hostUser.id, 'member');
    const meeting = await seedMeeting({ clubId: club.id, hostId: hostUser.id, past: true });

    await signInAs(adminUser.email, adminUser.password);
    const r = await setAttendanceFor(meeting.id, member.id, 'not_attending');

    expect(r.ok).toBe(true);
    expect(await fetchStatus(meeting.id, member.id)).toBe('not_attending');
  });

  it('E. 일반 member가 다른 멤버 정정 시도 → 거절', async () => {
    const adminUser = await seedUser();
    const m1 = await seedUser();
    const m2 = await seedUser();
    const club = await seedClub('A', adminUser.id);
    await seedMember(club.id, m1.id, 'member');
    await seedMember(club.id, m2.id, 'member');
    const meeting = await seedMeeting({ clubId: club.id, hostId: adminUser.id, past: false });

    await signInAs(m1.email, m1.password);
    const r = await setAttendanceFor(meeting.id, m2.id, 'attending');

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe('본인 외 참석은 호스트나 관리자만 수정할 수 있어요.');
    }
    expect(await fetchStatus(meeting.id, m2.id)).toBeNull();
  });

  it('F. 호스트가 deleteAttendance → 행 자체 삭제', async () => {
    const hostUser = await seedUser();
    const member = await seedUser();
    const adminUser = await seedUser();
    const club = await seedClub('A', adminUser.id);
    await seedMember(club.id, hostUser.id, 'member');
    await seedMember(club.id, member.id, 'member');
    const meeting = await seedMeeting({ clubId: club.id, hostId: hostUser.id, past: true });
    // 시드: member의 attending row
    await admin().from('attendances').insert({
      meeting_id: meeting.id, user_id: member.id, status: 'attending',
    });

    await signInAs(hostUser.email, hostUser.password);
    const r = await deleteAttendance(meeting.id, member.id);

    expect(r.ok).toBe(true);
    expect(await fetchStatus(meeting.id, member.id)).toBeNull();
  });

  it('G. 일반 member가 deleteAttendance 시도 → 거절', async () => {
    const adminUser = await seedUser();
    const m1 = await seedUser();
    const m2 = await seedUser();
    const club = await seedClub('A', adminUser.id);
    await seedMember(club.id, m1.id, 'member');
    await seedMember(club.id, m2.id, 'member');
    const meeting = await seedMeeting({ clubId: club.id, hostId: adminUser.id, past: true });
    await admin().from('attendances').insert({
      meeting_id: meeting.id, user_id: m2.id, status: 'attending',
    });

    await signInAs(m1.email, m1.password);
    const r = await deleteAttendance(meeting.id, m2.id);

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe('참석 기록 삭제는 호스트나 관리자만 할 수 있어요.');
    }
    expect(await fetchStatus(meeting.id, m2.id)).toBe('attending'); // 불변
  });
});
