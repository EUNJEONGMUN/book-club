'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { BookOpen, CalendarDays, MapPin, Users } from 'lucide-react';
import { getKoreanMeetingDateTime } from '@/lib/meeting-time';
import { cn } from '@/lib/utils';
import { meetingFormSchema, type MeetingFormInput } from '@/lib/validation/meeting';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { BookSearch } from '@/components/meeting/BookSearch';
import { LocationSearch } from '@/components/meeting/LocationSearch';
import { SeasonalIcon } from '@/components/theme/SeasonalIcon';
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

type Props = {
  defaultValues?: Partial<MeetingFormInput>;
  presenterOptions?: { user_id: string; display_name: string }[];
  onSubmit: (
    data: MeetingFormInput
  ) => Promise<{ ok: true; data?: { id: string } } | { ok: false; error: string }>;
  submitLabel: string;
  redirectOnSuccess?: (id: string) => string;
  cancelHref?: string;
};

export function MeetingForm({ defaultValues, presenterOptions, onSubmit, submitLabel, redirectOnSuccess, cancelHref }: Props) {
  const router = useRouter();

  const existingSchedule = defaultValues?.scheduled_at
    ? getKoreanMeetingDateTime(defaultValues.scheduled_at)
    : null;
  const initialDate = existingSchedule?.date ?? getKoreanMeetingDateTime(new Date()).date;
  const initialTime = existingSchedule?.time ?? '13:00';
  const [scheduledDate, setScheduledDate] = useState(initialDate);
  const [scheduledTime, setScheduledTime] = useState(initialTime);

  const form = useForm<MeetingFormRaw, unknown, MeetingFormInput>({
    resolver: zodResolver(meetingFormSchema),
    defaultValues: {
      book_title: '',
      book_author: '',
      book_cover_url: '',
      // 기본 날짜·시간 조합으로 scheduled_at 초기화 (사용자가 안 건드려도 valid)
      scheduled_at: defaultValues?.scheduled_at ?? `${initialDate}T${initialTime}`,
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
    <form data-slot="meeting-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5">

      {/* 책 정보 */}
      <MeetingFormSection part="book" icon={<SeasonalIcon iconRole="book"><BookOpen className="size-4" /></SeasonalIcon>} title="책 정보">
        <BookSearch
          onSelect={(book: KakaoBook) => {
            form.setValue('book_title', book.title, { shouldValidate: true });
            form.setValue('book_author', book.authors.join(', '), { shouldValidate: true });
            form.setValue('book_cover_url', book.thumbnail ?? '', { shouldValidate: true });
          }}
        />
        <div className="flex gap-4">
          {/* 표지 미리보기 */}
          <div className="shrink-0 w-20 h-28 rounded-lg bg-muted overflow-hidden flex items-center justify-center">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt="책 표지"
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <SeasonalIcon iconRole="book" className="size-7"><BookOpen className="size-7 text-muted-foreground" /></SeasonalIcon>
            )}
          </div>

          {/* 제목 / 저자 */}
          <div className="flex-1 space-y-3 min-w-0">
            <MeetingField name="book-title" label="책 제목" error={form.formState.errors.book_title?.message}>
              {(field) => (
                <Input
                  {...field}
                  {...form.register('book_title')}
                  placeholder="예: 데미안 — 비우면 '미정'"
                />
              )}
            </MeetingField>
            <MeetingField name="book-author" label="저자" error={form.formState.errors.book_author?.message}>
              {(field) => (
                <Input
                  {...field}
                  {...form.register('book_author')}
                  placeholder="예: 헤르만 헤세"
                />
              )}
            </MeetingField>
          </div>
        </div>

        {/* 표지 URL은 검색으로 자동 입력 — hidden으로 유지 */}
        <input type="hidden" {...form.register('book_cover_url')} />
      </MeetingFormSection>

      {presenterOptions && (
        <MeetingFormSection part="presenter">
          <MeetingField
            name="presenter"
            label={
              <>
                <SeasonalIcon iconRole="presenter" className="size-4 text-primary">
                  <Users className="size-4 text-muted-foreground" />
                </SeasonalIcon>
                <span className="text-card-foreground">발제자</span>
              </>
            }
            error={form.formState.errors.host_id?.message}
          >
            {(field) => (
              <Select {...field} {...form.register('host_id')}>
                {presenterOptions.map(({ user_id, display_name }) => (
                  <option key={user_id} value={user_id}>{display_name}</option>
                ))}
              </Select>
            )}
          </MeetingField>
        </MeetingFormSection>
      )}

      {/* 일정 */}
      <MeetingFormSection part="schedule" icon={<SeasonalIcon iconRole="schedule" className="size-4"><CalendarDays className="size-4" /></SeasonalIcon>} title="일정 (한국 시간)">
        <div className="grid max-w-80 grid-cols-[minmax(0,4fr)_minmax(0,3fr)] items-start gap-3">
          <MeetingField
            name="schedule-date"
            label="날짜"
            error={scheduledTime && form.formState.errors.scheduled_at
              ? (scheduledDate ? form.formState.errors.scheduled_at.message : '날짜를 선택해주세요')
              : undefined}
          >
            {(field) => (
              <Input
                {...field}
                type="date"
                value={scheduledDate}
                onChange={(e) => {
                  setScheduledDate(e.target.value);
                  updateScheduledAt(e.target.value, scheduledTime);
                }}
                className="h-10 px-3 py-0"
              />
            )}
          </MeetingField>
          <MeetingField
            name="schedule-time"
            label="시간"
            error={form.formState.isSubmitted && !scheduledTime ? '시간을 선택해주세요' : undefined}
          >
            {(field) => (
              <Select
                {...field}
                value={scheduledTime}
                onChange={(e) => {
                  setScheduledTime(e.target.value);
                  updateScheduledAt(scheduledDate, e.target.value);
                }}
              >
                <option value="" disabled>선택</option>
                {!TIME_OPTIONS.includes(initialTime) && <option value={initialTime}>{initialTime}</option>}
                {TIME_OPTIONS.map((time) => (
                  <option key={time} value={time}>{time}</option>
                ))}
              </Select>
            )}
          </MeetingField>
        </div>
      </MeetingFormSection>

      {/* 장소 */}
      <MeetingFormSection part="location" icon={<SeasonalIcon iconRole="location"><MapPin className="size-4" /></SeasonalIcon>} title="장소">
        <LocationSearch
          onSelect={(place: KakaoPlace) => {
            form.setValue('location_name', place.place_name, { shouldValidate: true });
            form.setValue('location_url', place.place_url, { shouldValidate: true });
            form.setValue('location_address', place.road_address_name || place.address_name, { shouldValidate: true });
          }}
        />
        <MeetingField name="location-name" label="장소 이름" error={form.formState.errors.location_name?.message}>
          {(field) => (
            <Input
              {...field}
              {...form.register('location_name')}
              placeholder="예: 아마츄어 작업실 — 비우면 '미정'"
            />
          )}
        </MeetingField>
        {/* 지도 링크는 장소 검색으로 자동 입력 */}
        <input type="hidden" {...form.register('location_url')} />
      </MeetingFormSection>

      <div data-part="actions" className={cancelHref ? 'grid grid-cols-2 gap-2' : undefined}>
        {cancelHref && (
          <Link href={cancelHref} className={cn(buttonVariants({ variant: 'outline' }), 'h-11 w-full')}>
            취소
          </Link>
        )}
        <Button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="h-11 w-full"
        >
          {form.formState.isSubmitting ? '저장 중...' : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function MeetingFormSection({
  part,
  icon,
  title,
  children,
}: {
  part: 'book' | 'presenter' | 'schedule' | 'location';
  icon?: React.ReactNode;
  title?: string;
  children: React.ReactNode;
}) {
  const titleId = `meeting-${part}-heading-${useId()}`;

  return (
    <section
      data-slot="meeting-form-section"
      data-part={part}
      aria-labelledby={title ? titleId : undefined}
      className="space-y-3 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-sm"
    >
      {title && (
        <h2 id={titleId} className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground">
          {icon}
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

function MeetingField({
  name,
  label,
  error,
  children,
}: {
  name: string;
  label: React.ReactNode;
  error?: string;
  children: (field: { id: string; 'aria-invalid'?: true; 'aria-describedby'?: string }) => React.ReactNode;
}) {
  const id = `meeting-${name}-${useId()}`;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div data-slot="meeting-form-field" data-field={name} className="min-w-0 space-y-1.5">
      <Label htmlFor={id} className="text-card-foreground">{label}</Label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': errorId })}
      {error && <p id={errorId} className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
