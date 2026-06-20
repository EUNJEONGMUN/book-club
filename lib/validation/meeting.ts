import { z } from 'zod';

const optionalUrl = z.union([z.url('올바른 URL 형식이 아닙니다'), z.literal('')]);

// 빈 문자열을 받으면 "미정"으로 채우는 헬퍼.
const optionalWithPlaceholder = (placeholder: string, max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : placeholder));

export const meetingFormSchema = z.object({
  club_id: z.string().uuid('잘못된 그룹 id'),
  book_title: optionalWithPlaceholder('미정', 200),
  // 저자는 비어도 됨 (책 자체가 미정이면 저자도 자연스럽게 비움)
  book_author: z.string().trim().max(100).optional().default(''),
  book_cover_url: optionalUrl,
  scheduled_at: z.string().min(1, '일시를 선택해주세요'),
  location_name: optionalWithPlaceholder('미정', 100),
  location_url: optionalUrl,
  location_address: z.string().trim().max(200).optional().default(''),
});

export type MeetingFormInput = z.infer<typeof meetingFormSchema>;
