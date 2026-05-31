import { z } from 'zod';

export const profileFormSchema = z.object({
  display_name: z.string().trim().min(1, '이름을 입력해주세요').max(20, '20자 이하로 입력해주세요'),
});

export type ProfileFormInput = z.infer<typeof profileFormSchema>;
