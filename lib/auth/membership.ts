import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';

export const getMembership = cache(async () => {
  const supabase = await getSupabaseServer();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return null;
  const { data, error } = await supabase.from('members')
    .select('role').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  return { user, role: data?.role ?? null };
});

export async function requireMember() {
  const membership = await getMembership();
  if (!membership) redirect('/login');
  if (membership.role === 'pending') redirect('/pending');
  if (membership.role !== 'admin' && membership.role !== 'member') redirect('/onboarding');
  return membership;
}

export async function requireAdmin() {
  const membership = await requireMember();
  if (membership.role !== 'admin') notFound();
  return membership;
}
