import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { applyToClub } from '@/lib/actions/club-members';
import { admin } from '../helpers/admin';
import { signInAs, signOut } from '../helpers/auth';
import { resetDb, seedUser, seedClub, seedMember, seedInvite } from '../helpers/seed';

async function fetchMemberRows(clubId: string, userId: string) {
  const { data } = await admin()
    .from('club_members')
    .select('role')
    .eq('club_id', clubId)
    .eq('user_id', userId);
  return data ?? [];
}

describe('applyToClub', () => {
  beforeEach(async () => {
    await resetDb();
    signOut();
  });

  it('A. 유효 token + 비-멤버 → ok=true + pending row 생성', async () => {
    const adminUser = await seedUser();
    const applicant = await seedUser();
    const club = await seedClub('A', adminUser.id);
    const token = await seedInvite(club.id, adminUser.email, adminUser.password);

    await signInAs(applicant.email, applicant.password);
    const result = await applyToClub(token);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.clubId).toBe(club.id);
      expect(result.clubName).toBe('A');
    }
    const rows = await fetchMemberRows(club.id, applicant.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe('pending');
  });

  it('B. 위조 token (랜덤 uuid) → ok=false 유효하지 않은 초대코드', async () => {
    const adminUser = await seedUser();
    const applicant = await seedUser();
    const club = await seedClub('A', adminUser.id);

    await signInAs(applicant.email, applicant.password);
    const result = await applyToClub(randomUUID());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('유효하지 않은 초대코드입니다.');
    const rows = await fetchMemberRows(club.id, applicant.id);
    expect(rows).toHaveLength(0);
  });

  it('C. rotate되어 revoke된 token → ok=false 취소된 초대링크', async () => {
    const adminUser = await seedUser();
    const applicant = await seedUser();
    const club = await seedClub('A', adminUser.id);
    const oldToken = await seedInvite(club.id, adminUser.email, adminUser.password);
    // 한 번 더 rotate → oldToken은 revoked_at 채워짐
    await seedInvite(club.id, adminUser.email, adminUser.password);

    await signInAs(applicant.email, applicant.password);
    const result = await applyToClub(oldToken);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(
        '취소된 초대링크입니다. admin에게 새 링크를 요청해주세요.'
      );
    }
    const rows = await fetchMemberRows(club.id, applicant.id);
    expect(rows).toHaveLength(0);
  });

  it('D. 이미 member인 사용자 신청 → ok=true (현재 동작) + DB 중복 row 없음', async () => {
    const adminUser = await seedUser();
    const alreadyMember = await seedUser();
    const club = await seedClub('A', adminUser.id);
    await seedMember(club.id, alreadyMember.id, 'member');
    const token = await seedInvite(club.id, adminUser.email, adminUser.password);

    await signInAs(alreadyMember.email, alreadyMember.password);
    const result = await applyToClub(token);

    // action이 SQL 함수의 status 필드를 무시하고 club_id, club_name만 읽음
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.clubId).toBe(club.id);

    const rows = await fetchMemberRows(club.id, alreadyMember.id);
    expect(rows).toHaveLength(1);              // 중복 row 없음
    expect(rows[0].role).toBe('member');        // 기존 role 보존
  });
});
