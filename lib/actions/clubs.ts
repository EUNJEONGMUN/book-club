'use server';

import { revalidatePath } from 'next/cache';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { getSupabaseServer } from '@/lib/supabase/server';

const createClubSchema = z.object({
  name: z.string().trim().min(1, '그룹 이름을 입력해주세요.').max(50, '그룹 이름은 50자 이내로 입력해주세요.'),
});

export async function createClub(input: { name: string }): Promise<
  { ok: true; clubId: string } | { ok: false; error: string }
> {
  const parsed = createClubSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' };
  }

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.rpc('create_club', { club_name: parsed.data.name });

  if (error) {
    console.error('[createClub]', error);
    Sentry.captureException(error, { tags: { action: 'createClub' } });
    if (error.message?.includes('Not authenticated')) {
      return { ok: false, error: '로그인이 필요합니다.' };
    }
    return { ok: false, error: '그룹을 만들지 못했습니다.' };
  }

  if (!data) {
    return { ok: false, error: '그룹을 만들지 못했습니다.' };
  }

  revalidatePath('/clubs');
  return { ok: true, clubId: data };
}
