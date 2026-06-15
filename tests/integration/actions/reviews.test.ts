import { describe, it, expect, beforeEach } from 'vitest';
import { upsertMyReview } from '@/lib/actions/reviews';
import { getMeetingReviews } from '@/lib/queries/reviews';
import { admin } from '../helpers/admin';
import { signInAs, signOut } from '../helpers/auth';
import { resetDb, seedUser, seedClub, seedMember } from '../helpers/seed';

async function seedPastMeeting(opts: { clubId: string; hostId: string }): Promise<{ id: string }> {
  const { data, error } = await admin()
    .from('meetings')
    .insert({
      club_id: opts.clubId,
      host_id: opts.hostId,
      book_title: '책',
      book_author: '저자',
      // 1일 전 (past meeting)
      scheduled_at: new Date(Date.now() - 86_400_000).toISOString(),
      location_name: '강남역',
    })
    .select('id')
    .single();
  if (error || !data) throw error ?? new Error('seedPastMeeting failed');
  return { id: data.id };
}

describe('meeting reviews', () => {
  beforeEach(async () => {
    await resetDb();
    signOut();
  });

  it('A. 멤버 본인 평 작성 + 공개 → 다른 멤버가 봄, 비-멤버는 못 봄', async () => {
    const adminUser = await seedUser();
    const member = await seedUser();
    const outsider = await seedUser();
    const club = await seedClub('A', adminUser.id);
    await seedMember(club.id, member.id, 'member');
    const meeting = await seedPastMeeting({ clubId: club.id, hostId: adminUser.id });

    await signInAs(member.email, member.password);
    const r = await upsertMyReview(meeting.id, { content: '좋았어요', is_public: true });
    expect(r.ok).toBe(true);

    // adminUser는 같은 클럽 → 봐야 함
    await signInAs(adminUser.email, adminUser.password);
    const fromAdmin = await getMeetingReviews(meeting.id);
    expect(fromAdmin.others).toHaveLength(1);
    expect(fromAdmin.others[0].content).toBe('좋았어요');

    // outsider는 다른 사람 → RLS로 차단
    await signInAs(outsider.email, outsider.password);
    const fromOutsider = await getMeetingReviews(meeting.id);
    expect(fromOutsider.others).toHaveLength(0);
  });

  it('B. 비공개 평은 본인만 봄, 같은 클럽 멤버도 못 봄', async () => {
    const adminUser = await seedUser();
    const member = await seedUser();
    const club = await seedClub('A', adminUser.id);
    await seedMember(club.id, member.id, 'member');
    const meeting = await seedPastMeeting({ clubId: club.id, hostId: adminUser.id });

    await signInAs(member.email, member.password);
    await upsertMyReview(meeting.id, { content: '비공개 메모', is_public: false });

    // 본인은 own에 보임
    const fromSelf = await getMeetingReviews(meeting.id);
    expect(fromSelf.own?.content).toBe('비공개 메모');

    // adminUser는 같은 클럽이어도 못 봄
    await signInAs(adminUser.email, adminUser.password);
    const fromAdmin = await getMeetingReviews(meeting.id);
    expect(fromAdmin.others).toHaveLength(0);
  });

  it('C. 미래 모임에 평 작성 시도 → 거절', async () => {
    const adminUser = await seedUser();
    const club = await seedClub('A', adminUser.id);
    // 미래 모임
    const { data } = await admin()
      .from('meetings')
      .insert({
        club_id: club.id,
        host_id: adminUser.id,
        book_title: '책', book_author: '저자',
        scheduled_at: new Date(Date.now() + 86_400_000).toISOString(),
        location_name: '강남역',
      })
      .select('id').single();
    if (!data) throw new Error('seed failed');

    await signInAs(adminUser.email, adminUser.password);
    const r = await upsertMyReview(data.id, { content: '기대돼요', is_public: false });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('모임이 끝난 후에 한줄 평을 남길 수 있어요.');
  });
});
