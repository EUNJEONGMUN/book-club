import { DISCUSSION_FILE_BUCKET, DISCUSSION_FILE_CHUNK_BYTES } from '@/lib/discussion-file';
import { getSupabaseBrowser } from './client';

export async function uploadDiscussionFileToStorage(
  file: File,
  { path, token }: { path: string; token: string },
  onProgress: (percent: number) => void,
) {
  if (file.size <= DISCUSSION_FILE_CHUNK_BYTES) {
    const { error } = await getSupabaseBrowser().storage.from(DISCUSSION_FILE_BUCKET)
      .uploadToSignedUrl(path, token, file, { contentType: file.type });
    if (error) throw error;
    return;
  }

  const { Upload } = await import('tus-js-client');
  const endpoint = new URL('/storage/v1/upload/resumable/sign', process.env.NEXT_PUBLIC_SUPABASE_URL!);
  if (/^[a-z0-9]+\.supabase\.co$/.test(endpoint.hostname)) {
    endpoint.hostname = endpoint.hostname.replace('.supabase.co', '.storage.supabase.co');
  }

  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: endpoint.toString(),
      headers: { 'x-signature': token, apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
      metadata: {
        bucketName: DISCUSSION_FILE_BUCKET,
        objectName: path,
        contentType: file.type,
      },
      chunkSize: DISCUSSION_FILE_CHUNK_BYTES,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      storeFingerprintForResuming: false,
      onProgress: (uploaded, total) => onProgress(Math.floor(uploaded / total * 100)),
      onError: reject,
      onSuccess: () => resolve(),
    });
    upload.start();
  });
}
