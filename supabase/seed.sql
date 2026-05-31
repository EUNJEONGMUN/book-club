-- 로컬 개발용 부트스트랩 멤버 + 초대 토큰
-- 운영 환경에서는 실행하지 않음
DO $$
DECLARE
  bootstrap_id UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = bootstrap_id) THEN
    INSERT INTO auth.users (
      id, email, encrypted_password, email_confirmed_at, raw_user_meta_data,
      instance_id, aud, role
    )
    VALUES (
      bootstrap_id, 'admin@example.com',
      crypt('password123', gen_salt('bf')), now(), '{}'::jsonb,
      '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
    );
    INSERT INTO profiles (id, display_name) VALUES (bootstrap_id, '관리자');
    INSERT INTO invites (token, created_by, expires_at)
    VALUES ('local-dev-invite-token-aaaaaaaaaaaaaaaa', bootstrap_id, now() + INTERVAL '365 days');
  END IF;
END $$;
