import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { removeDiscussionFile } from '@/lib/actions/discussion-files';
import { admin } from '../helpers/admin';
import { signInAs, signOut } from '../helpers/auth';
import { resetDb, seedUser, seedClub, seedMember } from '../helpers/seed';

async function seedMeeting(opts: {
  clubId: string;
  hostId: string;
  discussionFileUrl?: string | null;
}): Promise<{ id: string }> {
  const { data, error } = await admin()
    .from('meetings')
    .insert({
      club_id: opts.clubId,
      host_id: opts.hostId,
      book_title: '테스트 책',
      book_author: '저자',
      scheduled_at: new Date(Date.now() + 86_400_000).toISOString(),
      location_name: '강남역',
      discussion_file_url: opts.discussionFileUrl ?? null,
    })
    .select('id')
    .single();
  if (error || !data) throw error ?? new Error('seedMeeting 실패');
  return { id: data.id };
}

describe('discussion-files: assertHost guard (removeDiscussionFile 경유)', () => {
  beforeEach(async () => {
    await resetDb();
    signOut();
  });

  it('A. 로그인 X → 로그인 필요 에러', async () => {
    const host = await seedUser();
    const club = await seedClub('A', host.id);
    const meeting = await seedMeeting({ clubId: club.id, hostId: host.id });

    // signOut 상태 그대로 (beforeEach)
    const result = await removeDiscussionFile(meeting.id);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('로그인이 필요합니다.');
  });

  it('B. 같은 클럽 멤버지만 host 아님 → 발제자 전용 에러', async () => {
    const host = await seedUser();
    const otherMember = await seedUser();
    const club = await seedClub('A', host.id);
    await seedMember(club.id, otherMember.id, 'member');
    const meeting = await seedMeeting({ clubId: club.id, hostId: host.id });

    await signInAs(otherMember.email, otherMember.password);
    const result = await removeDiscussionFile(meeting.id);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('발제자만 사용할 수 있습니다.');
  });

  it('C. host 본인 → ok=true + DB의 discussion_file_url이 null로', async () => {
    const host = await seedUser();
    const club = await seedClub('A', host.id);
    const meeting = await seedMeeting({
      clubId: club.id,
      hostId: host.id,
      discussionFileUrl: 'https://example.com/dummy.pdf',
    });

    await signInAs(host.email, host.password);
    const result = await removeDiscussionFile(meeting.id);

    expect(result.ok).toBe(true);

    const { data } = await admin()
      .from('meetings')
      .select('discussion_file_url')
      .eq('id', meeting.id)
      .single();
    expect(data?.discussion_file_url).toBeNull();
  });

  it('D. 존재하지 않는 meetingId → 모임 없음 에러', async () => {
    const host = await seedUser();
    await signInAs(host.email, host.password);

    const result = await removeDiscussionFile(randomUUID());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('모임을 찾을 수 없습니다.');
  });
});
