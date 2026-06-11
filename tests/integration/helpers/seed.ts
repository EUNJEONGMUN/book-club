import { randomUUID } from 'crypto';
import { admin } from './admin';

const NEVER_UUID = '00000000-0000-0000-0000-000000000000';

export async function resetDb(): Promise<void> {
  const a = admin();
  await a.from('attendances').delete().neq('meeting_id', NEVER_UUID);
  await a.from('discussion_questions').delete().neq('id', NEVER_UUID);
  await a.from('meetings').delete().neq('id', NEVER_UUID);
  await a.from('club_invites').delete().neq('club_id', NEVER_UUID);
  await a.from('club_members').delete().neq('club_id', NEVER_UUID);
  await a.from('clubs').delete().neq('id', NEVER_UUID);
  await a.from('profiles').delete().neq('id', NEVER_UUID);

  const { data } = await a.auth.admin.listUsers();
  await Promise.all(
    (data?.users ?? []).map((u) => a.auth.admin.deleteUser(u.id))
  );
}

export type SeededUser = { id: string; email: string; password: string };

export async function seedUser(): Promise<SeededUser> {
  const email = `${randomUUID()}@test.local`;
  const password = 'test1234';
  const a = admin();
  const { data, error } = await a.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw error ?? new Error('seedUser: createUser 실패 (data.user 없음)');
  }

  // profiles 테이블은 auto-create trigger가 없으므로 명시 INSERT.
  const { error: profErr } = await a.from('profiles').insert({
    id: data.user.id,
    display_name: email.split('@')[0]!.slice(0, 24),
  });
  if (profErr) throw profErr;

  return { id: data.user.id, email, password };
}

export type SeededClub = { id: string; name: string };

export async function seedClub(name: string, adminUserId: string): Promise<SeededClub> {
  const a = admin();
  const { data: club, error: clubErr } = await a
    .from('clubs')
    .insert({ name, created_by: adminUserId })
    .select()
    .single();
  if (clubErr || !club) throw clubErr ?? new Error('seedClub: clubs insert 실패');

  const { error: memberErr } = await a.from('club_members').insert({
    club_id: club.id,
    user_id: adminUserId,
    role: 'admin',
  });
  if (memberErr) throw memberErr;

  return { id: club.id, name: club.name };
}

export async function seedMember(
  clubId: string,
  userId: string,
  role: 'admin' | 'member' | 'pending'
): Promise<void> {
  const { error } = await admin().from('club_members').insert({
    club_id: clubId,
    user_id: userId,
    role,
  });
  if (error) throw error;
}

export async function seedInvite(
  clubId: string,
  adminEmail: string,
  adminPassword: string
): Promise<string> {
  const { createClient } = await import('@supabase/supabase-js');
  const c = createClient(
    process.env.SUPABASE_TEST_URL!,
    process.env.SUPABASE_TEST_ANON_KEY!
  );
  const { error: authErr } = await c.auth.signInWithPassword({
    email: adminEmail,
    password: adminPassword,
  });
  if (authErr) throw authErr;

  const { data, error } = await c.rpc('rotate_invite', { target_club_id: clubId });
  if (error) throw error;
  if (!data) throw new Error('seedInvite: rotate_invite returned null');
  return data as string;
}
