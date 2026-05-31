import { z } from 'zod';

const optionalUrl = z.union([z.url('올바른 URL 형식이 아닙니다'), z.literal('')]);

export const meetingFormSchema = z.object({
  book_title: z.string().trim().min(1, '책 제목을 입력해주세요').max(200),
  book_author: z.string().trim().min(1, '저자를 입력해주세요').max(100),
  book_cover_url: optionalUrl,
  scheduled_at: z.string().min(1, '일시를 선택해주세요'),
  location_name: z.string().trim().min(1, '장소 이름을 입력해주세요').max(100),
  location_url: optionalUrl,
  location_address: z.string().trim().max(200).optional().default(''),
});

export type MeetingFormInput = z.infer<typeof meetingFormSchema>;
