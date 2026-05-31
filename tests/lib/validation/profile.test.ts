import { describe, it, expect } from 'vitest';
import { profileFormSchema } from '@/lib/validation/profile';

describe('profileFormSchema', () => {
  it('유효한 이름', () => {
    expect(profileFormSchema.safeParse({ display_name: '홍길동' }).success).toBe(true);
  });
  it('공백 이름 거부', () => {
    expect(profileFormSchema.safeParse({ display_name: '   ' }).success).toBe(false);
  });
  it('20자 초과 거부', () => {
    expect(profileFormSchema.safeParse({ display_name: 'a'.repeat(21) }).success).toBe(false);
  });
});
