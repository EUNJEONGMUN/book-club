import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _admin: SupabaseClient | null = null;

export function admin(): SupabaseClient {
  if (!_admin) {
    const url = process.env.SUPABASE_TEST_URL;
    const key = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        '.env.test에 SUPABASE_TEST_URL / SUPABASE_TEST_SERVICE_ROLE_KEY가 필요합니다. ' +
        '`pnpm supabase status` 출력에서 복사하세요.'
      );
    }
    _admin = createClient(url, key, { auth: { persistSession: false } });
  }
  return _admin;
}
