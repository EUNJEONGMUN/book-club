import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _current: SupabaseClient | null = null;

function anonClient(): SupabaseClient {
  const url = process.env.SUPABASE_TEST_URL;
  const key = process.env.SUPABASE_TEST_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      '.env.test에 SUPABASE_TEST_URL / SUPABASE_TEST_ANON_KEY가 필요합니다.'
    );
  }
  return createClient(url, key);
}

export function currentClient(): SupabaseClient {
  if (!_current) _current = anonClient();
  return _current;
}

export async function signInAs(email: string, password: string): Promise<void> {
  const c = anonClient();
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  _current = c;
}

export function signOut(): void {
  _current = anonClient();
}
