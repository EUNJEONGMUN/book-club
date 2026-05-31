import { z } from 'zod';

export const questionFormSchema = z.object({
  content: z.string().trim().min(1, '질문을 입력해주세요').max(1000),
});

export type QuestionFormInput = z.infer<typeof questionFormSchema>;
