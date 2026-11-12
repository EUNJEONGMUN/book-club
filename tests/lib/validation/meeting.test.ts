import { describe, it, expect } from 'vitest';
import { getKoreanMeetingDateTime, getKoreanMeetingDayDifference, hasMeetingStarted } from '@/lib/meeting-time';
import { meetingFormSchema } from '@/lib/validation/meeting';

describe('한국 시간 기준 D-Day', () => {
  it.each([
    ['2026-11-13T00:00:00+09:00', '2026-11-12T23:50:00+09:00', 1],
    ['2026-11-15T01:15:00+09:00', '2026-11-12T21:00:00+09:00', 3],
    ['2026-11-12T10:00:00+09:00', '2026-11-12T23:50:00+09:00', 0],
    ['2026-11-12T23:50:00+09:00', '2026-11-13T00:00:00+09:00', -1],
    ['2027-01-01T00:10:00+09:00', '2026-12-31T23:50:00+09:00', 1],
  ])('%s 일정과 기준 시각 %s의 날짜 차이는 %i일이다', (scheduledAt, now, expected) => {
    expect(getKoreanMeetingDayDifference(scheduledAt, new Date(now))).toBe(expected);
  });
});

describe('meetingFormSchema', () => {
  const valid = {
    book_title: '미움받을 용기',
    book_author: '기시미 이치로',
    scheduled_at: '2026-06-15T19:00',
    location_name: '강남역 스타벅스',
    location_url: '',
    location_address: '',
    book_cover_url: '',
  };

  it('모임 입력 시각을 한국 시간으로 저장하고 시작 시각부터 한줄 평을 허용한다', () => {
    const { scheduled_at } = meetingFormSchema.parse(valid);
    expect(new Date(scheduled_at).toISOString()).toBe('2026-06-15T10:00:00.000Z');
    expect(hasMeetingStarted(scheduled_at, Date.parse('2026-06-15T09:59:59.999Z'))).toBe(false);
    expect(hasMeetingStarted(scheduled_at, Date.parse('2026-06-15T10:00:00.000Z'))).toBe(true);
  });

  it('기존 일시는 한국 시간으로 표시하되 일정 입력을 수정하지 않으면 그대로 저장한다', () => {
    const stored = '2026-06-15T15:00:01.123456+00:00';
    expect(getKoreanMeetingDateTime(stored)).toEqual({ date: '2026-06-16', time: '00:00', weekday: '화' });
    expect(meetingFormSchema.parse({ ...valid, scheduled_at: stored }).scheduled_at).toBe(stored);
  });

  it('존재하지 않는 날짜는 거부한다', () => {
    expect(meetingFormSchema.safeParse({ ...valid, scheduled_at: '2026-02-30T19:00' }).success).toBe(false);
  });

  it('브라우저에서 전달한 다른 그룹 ID는 입력에서 제거한다', () => {
    const parsed = meetingFormSchema.parse({ ...valid, club_id: 'another-club' });
    expect(parsed).not.toHaveProperty('club_id');
  });

  it('빈 책 제목 → "미정"으로 채워짐', () => {
    const r = meetingFormSchema.safeParse({ ...valid, book_title: '' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.book_title).toBe('미정');
  });

  it('빈 저자 허용 (책 자체가 미정인 경우 자연스럽게 비움)', () => {
    const r = meetingFormSchema.safeParse({ ...valid, book_author: '' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.book_author).toBe('');
  });

  it('빈 장소 이름 → "미정"으로 채워짐', () => {
    const r = meetingFormSchema.safeParse({ ...valid, location_name: '' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.location_name).toBe('미정');
  });

  it('세 필드 모두 비어도 통과 (책·저자·장소 모두 미정)', () => {
    const r = meetingFormSchema.safeParse({
      ...valid,
      book_title: '',
      book_author: '',
      location_name: '',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.book_title).toBe('미정');
      expect(r.data.book_author).toBe('');
      expect(r.data.location_name).toBe('미정');
    }
  });

  it('잘못된 URL 거부', () => {
    expect(meetingFormSchema.safeParse({ ...valid, location_url: 'not-a-url' }).success).toBe(false);
  });

  it('빈 URL은 허용 (선택 필드)', () => {
    expect(meetingFormSchema.safeParse({ ...valid, location_url: '' }).success).toBe(true);
  });
});
