import { describe, it, expect } from 'vitest';
import { meetingFormSchema } from '@/lib/validation/meeting';

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

  it('유효한 입력 통과', () => {
    expect(meetingFormSchema.safeParse(valid).success).toBe(true);
  });

  it('빈 책 제목 거부', () => {
    expect(meetingFormSchema.safeParse({ ...valid, book_title: '' }).success).toBe(false);
  });

  it('빈 저자 거부', () => {
    expect(meetingFormSchema.safeParse({ ...valid, book_author: '' }).success).toBe(false);
  });

  it('빈 장소 이름 거부', () => {
    expect(meetingFormSchema.safeParse({ ...valid, location_name: '' }).success).toBe(false);
  });

  it('잘못된 URL 거부', () => {
    expect(meetingFormSchema.safeParse({ ...valid, location_url: 'not-a-url' }).success).toBe(false);
  });

  it('빈 URL은 허용 (선택 필드)', () => {
    expect(meetingFormSchema.safeParse({ ...valid, location_url: '' }).success).toBe(true);
  });
});
