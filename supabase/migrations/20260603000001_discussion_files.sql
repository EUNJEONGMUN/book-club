-- meetings 테이블에 발제 파일 URL 컬럼 추가
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS discussion_file_url TEXT;

-- discussion-files 버킷 (PDF + 이미지, 최대 20MB)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'discussion-files',
  'discussion-files',
  true,
  20971520,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- RLS: 인증된 사용자 조회 가능
CREATE POLICY "discussion-files read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'discussion-files');

-- RLS: 호스트만 업로드 (파일 경로: meeting_id/파일명)
CREATE POLICY "discussion-files upload" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'discussion-files');

CREATE POLICY "discussion-files update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'discussion-files');

CREATE POLICY "discussion-files delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'discussion-files');
