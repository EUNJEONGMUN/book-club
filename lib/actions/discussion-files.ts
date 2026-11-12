'use server';

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { PostgrestError } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  DISCUSSION_FILE_BUCKET as STORAGE_BUCKET,
  DISCUSSION_FILE_SIZE_ERROR,
  DISCUSSION_FILE_TYPES,
  MAX_DISCUSSION_FILE_BYTES,
} from '@/lib/discussion-file';
import { assertDiscussionFileHost, FILE_CHANGED, publicUrlToPath } from './_discussion-file-access';
import { cleanupDetachedFile, cleanupIfMeetingDeleted } from './_discussion-file-cleanup';
import { revalidateMeetingPaths } from './_revalidate-meeting';

const UPDATE_UNCONFIRMED = '파일 변경 결과를 확인하지 못했습니다. 페이지를 새로고침해 확인해주세요.';
const UPLOAD_EXPIRED = '업로드 요청이 만료되었거나 올바르지 않습니다. 파일을 다시 선택해주세요.';
const uploadMetadata = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().positive().max(MAX_DISCUSSION_FILE_BYTES, DISCUSSION_FILE_SIZE_ERROR),
  type: z.string().refine((type) => DISCUSSION_FILE_TYPES.includes(type)),
});

type UploadIntent = z.infer<typeof uploadMetadata> & {
  meetingId: string;
  hostId: string;
  path: string;
  previousUrl: string | null;
  previousUpdatedAt: string;
  expiresAt: number;
};

function uploadSignature(payload: string) {
  return createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY!)
    .update('discussion-file-upload:v1:')
    .update(payload)
    .digest();
}

function signUpload(intent: UploadIntent) {
  const payload = Buffer.from(JSON.stringify(intent)).toString('base64url');
  return `${payload}.${uploadSignature(payload).toString('base64url')}`;
}

function readUpload(ticket: string): UploadIntent | null {
  if (typeof ticket !== 'string' || ticket.length > 4096) return null;
  const [payload, signature, extra] = ticket.split('.');
  if (!payload || !signature || extra !== undefined) return null;
  const received = Buffer.from(signature, 'base64url');
  const expected = uploadSignature(payload);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  const intent = JSON.parse(Buffer.from(payload, 'base64url').toString()) as UploadIntent;
  return intent.expiresAt > Date.now() ? intent : null;
}

type HostAccess = Extract<Awaited<ReturnType<typeof assertDiscussionFileHost>>, { ok: true }>;

async function updateDiscussionFile(
  { supabase, meeting }: HostAccess,
  meetingId: string,
  url: string | null,
  fileName: string | null,
) {
  const update = supabase
    .from('meetings')
    .update({ discussion_file_url: url, discussion_file_name: fileName })
    .eq('id', meetingId)
    // Detect a file added and removed since a request read an empty slot.
    .eq('updated_at', meeting.updated_at);

  return (meeting.discussion_file_url === null
    ? update.is('discussion_file_url', null)
    : update.eq('discussion_file_url', meeting.discussion_file_url)
  ).select('id');
}

function isConfirmedRejection(error: PostgrestError | null, status: number): error is PostgrestError {
  // A structured client error from PostgREST confirms the write was rejected.
  return !!error && status >= 400 && status < 500 && /^(?:[A-Z0-9]{5}|PGRST\d{3})$/.test(error.code);
}

export async function prepareDiscussionFileUpload(
  meetingId: string,
  file: z.input<typeof uploadMetadata>,
  expectedUrl: string | null,
) {
  const auth = await assertDiscussionFileHost(meetingId);
  if (!auth.ok) return { ok: false as const, error: auth.error };
  if (expectedUrl !== auth.meeting.discussion_file_url) {
    return { ok: false as const, error: FILE_CHANGED };
  }

  const metadata = uploadMetadata.safeParse(file);
  if (!metadata.success) {
    const tooLarge = metadata.error.issues.some((issue) => issue.message === DISCUSSION_FILE_SIZE_ERROR);
    return { ok: false as const, error: tooLarge ? DISCUSSION_FILE_SIZE_ERROR : '파일 이름, 크기 또는 형식을 확인해주세요.' };
  }

  const safeName = metadata.data.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${meetingId}/${randomUUID()}-${safeName}`;
  const { data, error } = await auth.supabase.storage.from(STORAGE_BUCKET).createSignedUploadUrl(path);
  if (error) return { ok: false as const, error: error.message };

  const ticket = signUpload({
    ...metadata.data,
    meetingId,
    hostId: auth.meeting.host_id,
    path,
    previousUrl: auth.meeting.discussion_file_url,
    previousUpdatedAt: auth.meeting.updated_at,
    expiresAt: Date.now() + 2 * 60 * 60 * 1000,
  });
  return { ok: true as const, path, token: data.token, ticket };
}

export async function finishDiscussionFileUpload(meetingId: string, ticket: string) {
  const auth = await assertDiscussionFileHost(meetingId);
  if (!auth.ok) {
    if (auth.missingForUserId) {
      const intent = readUpload(ticket);
      if (intent?.meetingId === meetingId && intent.hostId === auth.missingForUserId) {
        await cleanupIfMeetingDeleted(meetingId, intent.path);
      }
    }
    return { ok: false as const, error: auth.error };
  }
  const intent = readUpload(ticket);
  if (!intent || intent.meetingId !== meetingId || intent.hostId !== auth.meeting.host_id) {
    return { ok: false as const, error: UPLOAD_EXPIRED };
  }
  const { supabase, meeting } = auth;
  const { path, name, previousUrl, previousUpdatedAt } = intent;
  const bucket = supabase.storage.from(STORAGE_BUCKET);
  const { data: { publicUrl } } = bucket.getPublicUrl(path);

  const stillCurrent = (row: { discussion_file_url: string | null; updated_at: string }) =>
    row.discussion_file_url === previousUrl && row.updated_at === previousUpdatedAt;
  const success = async () => {
    await cleanupDetachedFile(supabase, meetingId, publicUrlToPath(previousUrl, meetingId));
    await revalidateMeetingPaths(meetingId);
    return { ok: true as const, url: publicUrl, fileName: name };
  };

  if (meeting.discussion_file_url === publicUrl) return success();
  if (!stillCurrent(meeting)) {
    await cleanupDetachedFile(supabase, meetingId, path);
    return { ok: false as const, error: FILE_CHANGED };
  }

  const { data: file, error: fileError } = await bucket.info(path);
  if (fileError) {
    if (await cleanupIfMeetingDeleted(meetingId, path)) return { ok: false as const, error: FILE_CHANGED };
    return { ok: false as const, error: '업로드된 파일을 확인하지 못했습니다. 다시 시도해주세요.' };
  }
  if (file.size !== intent.size || file.contentType !== intent.type) {
    return { ok: false as const, error: '업로드된 파일의 크기 또는 형식이 일치하지 않습니다.' };
  }

  const { data: updated, error, status } = await updateDiscussionFile(auth, meetingId, publicUrl, name);
  if (updated?.length) return success();

  const { data: current, error: readError } = await supabase
    .from('meetings')
    .select('discussion_file_url, updated_at')
    .eq('id', meetingId)
    .maybeSingle();
  if (current?.discussion_file_url === publicUrl) return success();
  if (current && !stillCurrent(current)) {
    await cleanupDetachedFile(supabase, meetingId, path);
    return { ok: false as const, error: FILE_CHANGED };
  }
  if (!current && !readError && await cleanupIfMeetingDeleted(meetingId, path)) {
    return { ok: false as const, error: FILE_CHANGED };
  }

  // Another confirmation of the same upload can still commit against this snapshot.
  console.error('[discussion-files] Upload update unconfirmed', { path, error, readError });
  return { ok: false as const, error: isConfirmedRejection(error, status) ? error.message : UPDATE_UNCONFIRMED };
}

export async function removeDiscussionFile(meetingId: string, expectedUrl?: string | null) {
  const auth = await assertDiscussionFileHost(meetingId);
  if (!auth.ok) return { ok: false as const, error: auth.error };
  if (expectedUrl !== undefined && expectedUrl !== auth.meeting.discussion_file_url) {
    return { ok: false as const, error: FILE_CHANGED };
  }
  const { data: updated, error, status } = await updateDiscussionFile(auth, meetingId, null, null);
  if (updated?.length === 0) return { ok: false as const, error: FILE_CHANGED };
  if (!updated?.length) {
    if (isConfirmedRejection(error, status)) return { ok: false as const, error: error.message };
    console.error('[discussion-files] Delete update unconfirmed', { meetingId, error });
    return { ok: false as const, error: UPDATE_UNCONFIRMED };
  }

  await cleanupDetachedFile(auth.supabase, meetingId, publicUrlToPath(auth.meeting.discussion_file_url, meetingId));
  await revalidateMeetingPaths(meetingId);
  return { ok: true as const };
}
