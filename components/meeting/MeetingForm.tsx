'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { BookOpen, CalendarDays, MapPin } from 'lucide-react';
import { meetingFormSchema, type MeetingFormInput } from '@/lib/validation/meeting';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BookSearch } from '@/components/meeting/BookSearch';
import { LocationSearch } from '@/components/meeting/LocationSearch';
import type { KakaoBook } from '@/lib/actions/book-search';
import type { KakaoPlace } from '@/lib/actions/location-search';
import type { z } from 'zod';

type MeetingFormRaw = z.input<typeof meetingFormSchema>;

const TIME_OPTIONS = Array.from({ length: 36 }, (_, i) => {
  const totalMinutes = 6 * 60 + i * 30;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
});

function splitScheduledAt(iso: string): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const totalMin = d.getHours() * 60 + d.getMinutes();
  const rounded = Math.round(totalMin / 30) * 30;
  const rh = Math.floor(rounded / 60) % 24;
  const rm = rounded % 60;
  const time = `${String(rh).padStart(2, '0')}:${String(rm).padStart(2, '0')}`;
  const rawTime = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return { date, time: TIME_OPTIONS.includes(time) ? time : rawTime };
}

type Props = {
  defaultValues?: Partial<MeetingFormInput>;
  onSubmit: (
    data: MeetingFormInput
  ) => Promise<{ ok: true; data?: { id: string } } | { ok: false; error: string }>;
  submitLabel: string;
  redirectOnSuccess?: (id: string) => string;
};

export function MeetingForm({ defaultValues, onSubmit, submitLabel, redirectOnSuccess }: Props) {
  const router = useRouter();

  const { date: initDate, time: initTime } = splitScheduledAt(defaultValues?.scheduled_at ?? '');
  const [scheduledDate, setScheduledDate] = useState(initDate);
  const [scheduledTime, setScheduledTime] = useState(initTime || '');

  const form = useForm<MeetingFormRaw, unknown, MeetingFormInput>({
    resolver: zodResolver(meetingFormSchema),
    defaultValues: {
      book_title: '',
      book_author: '',
      book_cover_url: '',
      scheduled_at: defaultValues?.scheduled_at ?? '',
      location_name: '',
      location_url: '',
      location_address: '',
      ...defaultValues,
    },
  });

  function updateScheduledAt(date: string, time: string) {
    const value = date && time ? `${date}T${time}` : '';
    form.setValue('scheduled_at', value, { shouldValidate: form.formState.isSubmitted });
  }

  async function handleSubmit(data: MeetingFormInput) {
    const result = await onSubmit(data);
    if (!result.ok) return toast.error(result.error);
    toast.success('저장되었습니다');
    if (redirectOnSuccess && result.data?.id) {
      router.push(redirectOnSuccess(result.data.id));
    } else {
      router.back();
    }
    router.refresh();
  }

  const coverUrl = form.watch('book_cover_url');

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5">

      {/* 책 정보 */}
      <Section icon={<BookOpen className="w-4 h-4" />} title="책 정보">
        <BookSearch
          onSelect={(book: KakaoBook) => {
            form.setValue('book_title', book.title, { shouldValidate: true });
            form.setValue('book_author', book.authors.join(', '), { shouldValidate: true });
            form.setValue('book_cover_url', book.thumbnail ?? '', { shouldValidate: true });
          }}
        />
        <div className="flex gap-4">
          {/* 표지 미리보기 */}
          <div className="shrink-0 w-20 h-28 rounded-lg bg-stone-100 overflow-hidden flex items-center justify-center">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt="책 표지"
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <BookOpen className="w-7 h-7 text-stone-300" />
            )}
          </div>

          {/* 제목 / 저자 */}
          <div className="flex-1 space-y-3 min-w-0">
            <FormField label="책 제목" error={form.formState.errors.book_title?.message}>
              <Input
                {...form.register('book_title')}
                placeholder="예: 데미안"
                className="bg-stone-50 border-stone-200"
              />
            </FormField>
            <FormField label="저자" error={form.formState.errors.book_author?.message}>
              <Input
                {...form.register('book_author')}
                placeholder="예: 헤르만 헤세"
                className="bg-stone-50 border-stone-200"
              />
            </FormField>
          </div>
        </div>

        {/* 표지 URL은 검색으로 자동 입력 — hidden으로 유지 */}
        <input type="hidden" {...form.register('book_cover_url')} />
      </Section>

      {/* 일정 */}
      <Section icon={<CalendarDays className="w-4 h-4" />} title="일정">
        <div className="space-y-3">
          <FormField
            label="날짜"
            error={form.formState.isSubmitted && !scheduledDate ? '날짜를 선택해주세요' : undefined}
          >
            <Input
              type="date"
              value={scheduledDate}
              onChange={(e) => {
                setScheduledDate(e.target.value);
                updateScheduledAt(e.target.value, scheduledTime);
              }}
              className="h-10 bg-stone-50 border-stone-200"
            />
          </FormField>
          <FormField
            label="시간"
            error={form.formState.isSubmitted && !scheduledTime ? '시간을 선택해주세요' : undefined}
          >
            <select
              value={scheduledTime}
              onChange={(e) => {
                setScheduledTime(e.target.value);
                updateScheduledAt(scheduledDate, e.target.value);
              }}
              className="w-full h-10 rounded-md border border-stone-200 bg-stone-50 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-stone-300"
            >
              <option value="" disabled>선택</option>
              {TIME_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </FormField>
        </div>
      </Section>

      {/* 장소 */}
      <Section icon={<MapPin className="w-4 h-4" />} title="장소">
        <LocationSearch
          onSelect={(place: KakaoPlace) => {
            form.setValue('location_name', place.place_name, { shouldValidate: true });
            form.setValue('location_url', place.place_url, { shouldValidate: true });
            form.setValue('location_address', place.road_address_name || place.address_name, { shouldValidate: true });
          }}
        />
        <FormField label="장소 이름" error={form.formState.errors.location_name?.message}>
          <Input
            {...form.register('location_name')}
            placeholder="예: 아마츄어 작업실"
            className="bg-stone-50 border-stone-200"
          />
        </FormField>
        {/* 지도 링크는 장소 검색으로 자동 입력 */}
        <input type="hidden" {...form.register('location_url')} />
      </Section>

      <Button
        type="submit"
        disabled={form.formState.isSubmitting}
        className="w-full bg-stone-800 hover:bg-stone-700 text-white"
      >
        {form.formState.isSubmitting ? '저장 중...' : submitLabel}
      </Button>
    </form>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-2 text-stone-500">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wide">{title}</span>
      </div>
      {children}
    </div>
  );
}

function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-stone-700">{label}</Label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
