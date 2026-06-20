import { describe, it, expect } from 'vitest';
import { meetingFormSchema } from '@/lib/validation/meeting';

describe('meetingFormSchema', () => {
  const valid = {
    club_id: '12345678-1234-4567-89ab-cdef01234567',
    book_title: '미움받을 용기',
    book_author: '기시미 이치로',
    scheduled_at: '2026-06-15T19:00',
    location_name: '강남역 스타벅스',
    location_url: '',
    location_address: '',
    book_cover_url: '',
  };

  it('유효한 입력 통과', () => {
    expect(meetingFormSchema.safeParse(valid).success).toBe(true);
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
