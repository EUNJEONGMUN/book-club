'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { profileFormSchema } from '@/lib/validation/profile';

export async function createProfile(displayName: string, userId?: string) {
  const parsed = profileFormSchema.safeParse({ display_name: displayName });
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };

  let uid = userId;

  if (!uid) {
    // 세션 쿠키에서 사용자 확인 (Google OAuth 등 기존 세션이 있는 경우)
    const supabase = await getSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false as const, error: '로그인이 필요합니다' };
    uid = user.id;
  } else {
    // userId가 직접 전달된 경우 admin으로 실제 존재하는 사용자인지 검증
    const admin = getSupabaseAdmin();
    const { data: { user }, error } = await admin.auth.admin.getUserById(uid);
    if (error || !user) return { ok: false as const, error: '유효하지 않은 사용자입니다' };
    // 최근 60초 이내에 생성된 계정만 허용
    const createdAt = new Date(user.created_at).getTime();
    if (Date.now() - createdAt > 60_000) return { ok: false as const, error: '세션이 만료되었습니다. 다시 시도해주세요.' };
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from('profiles')
    .insert({ id: uid, display_name: parsed.data.display_name });
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

export async function updateAvatarUrl(url: string) {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: '로그인이 필요합니다' };
  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: url || null })
    .eq('id', user.id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath('/more');
  revalidatePath('/more/profile');
  return { ok: true as const };
}
