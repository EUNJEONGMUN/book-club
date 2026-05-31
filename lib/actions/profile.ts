'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServer } from '@/lib/supabase/server';
import { profileFormSchema } from '@/lib/validation/profile';

export async function createProfile(displayName: string) {
  const parsed = profileFormSchema.safeParse({ display_name: displayName });
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };

  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: '로그인이 필요합니다' };

  const { error } = await supabase
    .from('profiles')
    .insert({ id: user.id, display_name: parsed.data.display_name });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath('/');
  return { ok: true as const };
}

export async function updateProfile(input: unknown) {
  const parsed = profileFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: '로그인이 필요합니다' };
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: parsed.data.display_name })
    .eq('id', user.id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath('/more');
  revalidatePath('/more/profile');
  return { ok: true as const };
}
