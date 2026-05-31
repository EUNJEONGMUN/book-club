'use client';

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
  const form = useForm<MeetingFormRaw, unknown, MeetingFormInput>({
    resolver: zodResolver(meetingFormSchema),
    defaultValues: {
      book_title: '',
      book_author: '',
      book_cover_url: '',
      scheduled_at: '',
      location_name: '',
      location_url: '',
      location_address: '',
      ...defaultValues,
    },
  });

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
      <FormField label="책 제목" error={form.formState.errors.book_title?.message}>
        <Input {...form.register('book_title')} placeholder="예: 미움받을 용기" />
      </FormField>
      <FormField label="저자" error={form.formState.errors.book_author?.message}>
        <Input {...form.register('book_author')} placeholder="예: 기시미 이치로" />
      </FormField>
      <FormField label="일시" error={form.formState.errors.scheduled_at?.message}>
        <Input type="datetime-local" {...form.register('scheduled_at')} />
      </FormField>
      <FormField label="장소 이름" error={form.formState.errors.location_name?.message}>
        <Input {...form.register('location_name')} placeholder="예: 강남역 스타벅스" />
      </FormField>
      <FormField label="장소 주소 (선택)" error={form.formState.errors.location_address?.message}>
        <Input {...form.register('location_address')} placeholder="서울시 강남구..." />
      </FormField>
      <FormField label="장소 링크 또는 줌 URL (선택)" error={form.formState.errors.location_url?.message}>
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
