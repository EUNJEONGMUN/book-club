import { z } from 'zod';

export const REVIEW_VISIBILITY = ['private', 'public', 'anonymous'] as const;
export type ReviewVisibility = (typeof REVIEW_VISIBILITY)[number];

export const reviewFormSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, '내용을 입력해주세요.')
    .max(200, '200자 이내로 입력해주세요.'),
  visibility: z.enum(REVIEW_VISIBILITY),
});

export type ReviewFormInput = z.infer<typeof reviewFormSchema>;
