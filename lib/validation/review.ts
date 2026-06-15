import { z } from 'zod';

export const reviewFormSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, '내용을 입력해주세요.')
    .max(200, '200자 이내로 입력해주세요.'),
  is_public: z.boolean(),
});

export type ReviewFormInput = z.infer<typeof reviewFormSchema>;
