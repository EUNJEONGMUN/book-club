'use server';

import { revalidatePath } from 'next/cache';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { getSupabaseServer } from '@/lib/supabase/server';

const updateClubSchema = z.object({
  clubId: z.string().uuid(),
  name: z.string().trim().min(1, '그룹 이름을 입력해주세요.').max(50, '그룹 이름은 50자 이내로 입력해주세요.'),
  description: z.string().trim().max(500, '설명은 500자 이내로 입력해주세요.').optional().nullable(),
});

export async function updateClub(input: {
  clubId: string;
  name: string;
  description?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = updateClubSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' };
  }

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from('clubs')
    .update({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
    })
    .eq('id', parsed.data.clubId)
    .select('id');

  if (error) {
    console.error('[updateClub]', error);
    Sentry.captureException(error, { tags: { action: 'updateClub' } });
    return { ok: false, error: '그룹 정보를 저장하지 못했습니다.' };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: '그룹 관리자만 정보를 수정할 수 있어요.' };
  }

  revalidatePath(`/clubs/${parsed.data.clubId}`);
  revalidatePath(`/clubs/${parsed.data.clubId}/settings`);
  revalidatePath('/clubs');
  return { ok: true };
}
