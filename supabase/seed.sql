-- 로컬 개발용 부트스트랩 멤버 + 초대 토큰
-- 운영 환경에서는 실행하지 않음
DO $$
DECLARE
  bootstrap_id UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = bootstrap_id) THEN
    INSERT INTO auth.users (
      id, email, encrypted_password, email_confirmed_at, raw_user_meta_data,
      instance_id, aud, role, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current
    )
    VALUES (
      bootstrap_id, 'admin@example.com',
      crypt('password123', gen_salt('bf')), now(), '{}'::jsonb,
      '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      now(), now(),
      '', '', '', '', ''
    );
    INSERT INTO auth.identities (
      provider_id, user_id, identity_data, provider, created_at, updated_at
    )
    VALUES (
      'admin@example.com', bootstrap_id,
      jsonb_build_object('sub', bootstrap_id::text, 'email', 'admin@example.com'),
      'email', now(), now()
    );
    INSERT INTO profiles (id, display_name) VALUES (bootstrap_id, '관리자');
    INSERT INTO invites (token, created_by, expires_at)
    VALUES ('local-dev-invite-token-aaaaaaaaaaaaaaaa', bootstrap_id, now() + INTERVAL '365 days');
  END IF;
END $$;
