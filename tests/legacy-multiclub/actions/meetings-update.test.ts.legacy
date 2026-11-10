import { describe, it, expect, beforeEach } from 'vitest';
import { updateMeeting } from '@/lib/actions/meetings';
import { admin } from '../helpers/admin';
import { signInAs, signOut } from '../helpers/auth';
import { resetDb, seedUser, seedClub, seedMember } from '../helpers/seed';

async function seedMeeting(opts: {
  clubId: string;
  hostId: string;
  bookTitle: string;
}): Promise<{ id: string }> {
  const { data, error } = await admin()
    .from('meetings')
    .insert({
      club_id: opts.clubId,
      host_id: opts.hostId,
      book_title: opts.bookTitle,
      book_author: '저자',
      scheduled_at: new Date(Date.now() + 86_400_000).toISOString(),
      location_name: '강남역',
    })
    .select('id')
    .single();
  if (error || !data) throw error ?? new Error('seedMeeting 실패');
  return { id: data.id };
}

async function fetchMeetingTitle(id: string): Promise<string | null> {
  const { data } = await admin().from('meetings').select('book_title').eq('id', id).maybeSingle();
  return data?.book_title ?? null;
}

const validInput = (clubId: string, title: string) => ({
  club_id: clubId,
  book_title: title,
  book_author: '저자',
  book_cover_url: '',
  scheduled_at: '2026-12-01T19:00',
  location_name: '강남역 스타벅스',
  location_url: '',
  location_address: '',
});

describe('updateMeeting (RLS-enforced, host-only)', () => {
  beforeEach(async () => {
    await resetDb();
    signOut();
  });

  it('A. host 본인이 수정하면 book_title 변경됨', async () => {
    const host = await seedUser();
    const club = await seedClub('A', host.id);
    const meeting = await seedMeeting({ clubId: club.id, hostId: host.id, bookTitle: '원본 책' });

    await signInAs(host.email, host.password);
    const result = await updateMeeting(meeting.id, validInput(club.id, '바뀐 책'));

    expect(result.ok).toBe(true);
    expect(await fetchMeetingTitle(meeting.id)).toBe('바뀐 책');
  });

  it('B. 같은 클럽의 비-host 멤버가 수정 시도하면 거절 + book_title 불변', async () => {
    const host = await seedUser();
    const otherMember = await seedUser();
    const club = await seedClub('A', host.id);
    await seedMember(club.id, otherMember.id, 'member');
    const meeting = await seedMeeting({ clubId: club.id, hostId: host.id, bookTitle: '원본 책' });

    await signInAs(otherMember.email, otherMember.password);
    const result = await updateMeeting(meeting.id, validInput(club.id, '바뀐 책'));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('발제자만 모임을 수정할 수 있어요.');
    expect(await fetchMeetingTitle(meeting.id)).toBe('원본 책');
  });
});
