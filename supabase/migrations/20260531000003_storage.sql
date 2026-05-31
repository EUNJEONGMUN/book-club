-- 버킷 생성
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('book-covers', 'book-covers', true, 5242880, ARRAY['image/jpeg','image/png','image/webp']),
  ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Storage RLS
-- book-covers: 인증된 사용자 누구나 업로드/조회 (파일 경로 검증은 Server Action에서)
CREATE POLICY "book-covers read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'book-covers');
CREATE POLICY "book-covers upload" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'book-covers');
CREATE POLICY "book-covers update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'book-covers');

-- avatars: 본인 파일만 (파일 이름이 user_id로 시작)
CREATE POLICY "avatars read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'avatars');
CREATE POLICY "avatars upload own" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "avatars update own" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
