'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { meetingFormSchema, type MeetingFormInput } from '@/lib/validation/meeting';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { z } from 'zod';

type MeetingFormRaw = z.input<typeof meetingFormSchema>;

// 시간 선택 옵션: 06:00 ~ 23:30 (30분 단위)
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
  const rawTime = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  // 30분 단위 옵션에 없을 경우 가장 가까운 값으로 반올림
  const totalMin = d.getHours() * 60 + d.getMinutes();
  const rounded = Math.round(totalMin / 30) * 30;
  const rh = Math.floor(rounded / 60) % 24;
  const rm = rounded % 60;
  const time = `${String(rh).padStart(2, '0')}:${String(rm).padStart(2, '0')}`;
  // 옵션 범위 내 있으면 rounded, 없으면 원래 값
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
  const [scheduledTime, setScheduledTime] = useState(initTime || TIME_OPTIONS[12]); // 기본 12:00

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

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
      {/* 책 표지 URL */}
      <FormField label="책 표지 URL (선택)" error={form.formState.errors.book_cover_url?.message}>
        <Input
          {...form.register('book_cover_url')}
          placeholder="https://contents.kyobobook.co.kr/..."
        />
      </FormField>

      {/* 책 표지 미리보기 */}
      {form.watch('book_cover_url') && (
        <div className="w-20 h-28 bg-slate-100 rounded overflow-hidden">
          <img
            src={form.watch('book_cover_url') ?? ''}
            alt="책 표지 미리보기"
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      )}

      <FormField label="책 제목" error={form.formState.errors.book_title?.message}>
        <Input {...form.register('book_title')} placeholder="예: 데미안" />
      </FormField>
      <FormField label="저자" error={form.formState.errors.book_author?.message}>
        <Input {...form.register('book_author')} placeholder="예: 헤르만 헤세" />
      </FormField>

      {/* 날짜 */}
      <FormField label="날짜">
        <Input
          type="date"
          value={scheduledDate}
          onChange={(e) => {
            setScheduledDate(e.target.value);
            updateScheduledAt(e.target.value, scheduledTime);
          }}
        />
      </FormField>

      {/* 시간 */}
      <FormField label="시간" error={form.formState.errors.scheduled_at?.message}>
        <select
          value={scheduledTime}
          onChange={(e) => {
            setScheduledTime(e.target.value);
            updateScheduledAt(scheduledDate, e.target.value);
          }}
          className="w-full h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {TIME_OPTIONS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </FormField>

      <FormField label="장소 이름" error={form.formState.errors.location_name?.message}>
        <Input {...form.register('location_name')} placeholder="예: 강남역 스타벅스" />
      </FormField>
      <FormField label="장소 링크 (선택)" error={form.formState.errors.location_url?.message}>
        <Input {...form.register('location_url')} placeholder="https://..." />
      </FormField>

      <Button type="submit" disabled={form.formState.isSubmitting} className="w-full">
        {submitLabel}
      </Button>
    </form>
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
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
