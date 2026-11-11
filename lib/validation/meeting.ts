import { z } from 'zod';

const optionalUrl = z.union([z.url('올바른 URL 형식이 아닙니다'), z.literal('')]);

const scheduledAt = z
  .string()
  .min(1, '일시를 선택해주세요')
  .pipe(z.iso.datetime({ local: true, offset: true, error: '올바른 일시를 선택해주세요' }))
  // 모임 입력 폼의 날짜와 시각은 한국 표준시(KST)다.
  .transform((value) => /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}+09:00`);

// 빈 문자열을 받으면 "미정"으로 채우는 헬퍼.
const optionalWithPlaceholder = (placeholder: string, max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : placeholder));

export const meetingFormSchema = z.object({
  book_title: optionalWithPlaceholder('미정', 200),
  // 저자는 비어도 됨 (책 자체가 미정이면 저자도 자연스럽게 비움)
  book_author: z.string().trim().max(100).optional().default(''),
  book_cover_url: optionalUrl,
  scheduled_at: scheduledAt,
  location_name: optionalWithPlaceholder('미정', 100),
  location_url: optionalUrl,
  location_address: z.string().trim().max(200).optional().default(''),
});

export type MeetingFormInput = z.infer<typeof meetingFormSchema>;
