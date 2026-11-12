import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { DISCUSSION_FILE_BUCKET } from '@/lib/discussion-file';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function cleanupDiscussionFile(path: string, client?: SupabaseClient<Database>) {
  try {
    const { data, error } = await (client ?? getSupabaseAdmin()).storage.from(DISCUSSION_FILE_BUCKET).remove([path]);
    if (error) {
      console.error('[discussion-files] Storage cleanup failed', { path, error });
      return false;
    }
    return !client || !!data?.length;
  } catch (error) {
    console.error('[discussion-files] Storage cleanup failed', { path, error });
    return false;
  }
}

// A row hidden by RLS is indistinguishable from a deleted row to the caller.
export async function cleanupIfMeetingDeleted(meetingId: string, path: string) {
  try {
    const { data, error } = await getSupabaseAdmin().from('meetings').select('id').eq('id', meetingId).maybeSingle();
    if (error) {
      console.error('[discussion-files] Could not verify meeting deletion', { meetingId, error });
      return false;
    }
    if (data) return false;
    await cleanupDiscussionFile(path);
    return true;
  } catch (error) {
    console.error('[discussion-files] Could not verify meeting deletion', { meetingId, error });
    return false;
  }
}

export async function cleanupDetachedFile(client: SupabaseClient<Database>, meetingId: string, path: string | null) {
  if (path && !await cleanupDiscussionFile(path, client)) {
    // The host's Storage permission ends when a concurrent deletion removes the row.
    await cleanupIfMeetingDeleted(meetingId, path);
  }
}
