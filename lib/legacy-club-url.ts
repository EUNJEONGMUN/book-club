import { cache } from 'react';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// The old club UUID is retained only to redirect previously shared URLs.
export const getLegacyClubId = cache(async (): Promise<string> => {
  const { data, error } = await getSupabaseAdmin().from('club_settings')
    .select('legacy_club_id').eq('id', 1).single();
  if (error || !data) throw new Error('부글부글 설정을 확인해주세요.');
  return data.legacy_club_id;
});
