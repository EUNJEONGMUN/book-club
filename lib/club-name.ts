import { cache } from 'react';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// Only the public display name crosses the server/client boundary.
export const getClubName = cache(async (): Promise<string> => {
  const { data, error } = await getSupabaseAdmin().from('club_settings')
    .select('name').eq('id', 1).single();
  if (error || !data?.name) return '부글부글';
  return data.name;
});
