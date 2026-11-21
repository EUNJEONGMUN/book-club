'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServer } from '@/lib/supabase/server';
import { profileFormSchema, profileUpdateSchema } from '@/lib/validation/profile';

export async function createProfile(displayName: string) {
  const parsed = profileFormSchema.safeParse({ display_name: displayName });
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };

  const supabase = await getSupabaseServer();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false as const, error: '로그인이 필요합니다' };

  const { error } = await supabase
    .from('profiles')
    .upsert(
      { id: user.id, display_name: parsed.data.display_name },
      { onConflict: 'id', ignoreDuplicates: true },
    );
  if (error) return { ok: false as const, error: error.message };
  revalidatePath('/');
  return { ok: true as const };
}

export async function updateProfile(input: unknown) {
  const parsed = profileUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: '로그인이 필요합니다' };
  const { display_name, avatarId } = parsed.data;
  const avatarUrl = avatarId
    ? supabase.storage.from('avatars').getPublicUrl(`${user.id}/${avatarId}`).data.publicUrl
    : undefined;
  const { data, error } = await supabase
    .from('profiles')
    .update({ display_name, avatar_url: avatarUrl })
    .eq('id', user.id)
    .select('display_name, avatar_url')
    .single();
  if (error) return { ok: false as const, error: error.message };
  revalidatePath('/more');
  revalidatePath('/more/profile');
  return { ok: true as const, profile: data };
}
