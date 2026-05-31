import { describe, it, expect } from 'vitest';
import { questionFormSchema } from '@/lib/validation/question';

describe('questionFormSchema', () => {
  it('유효한 질문', () => {
    expect(questionFormSchema.safeParse({ content: '주인공의 선택에 동의하시나요?' }).success).toBe(true);
  });
  it('빈 질문 거부', () => {
    expect(questionFormSchema.safeParse({ content: '' }).success).toBe(false);
  });
  it('1000자 초과 거부', () => {
    expect(questionFormSchema.safeParse({ content: 'a'.repeat(1001) }).success).toBe(false);
  });
});
