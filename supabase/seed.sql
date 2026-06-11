-- 로컬 개발용 관리자 계정
-- 운영 환경에서는 실행하지 않음
-- db reset 후 실제 관리자 계정으로 is_admin=true 수동 설정 필요 (docs/bootstrap.md 참고)
DO $$
DECLARE
  admin_id UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = admin_id) THEN
    INSERT INTO auth.users (
      id, email, encrypted_password, email_confirmed_at, raw_user_meta_data,
      instance_id, aud, role, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current
    )
    VALUES (
      admin_id, 'admin@example.local',
      crypt('password123', gen_salt('bf')), now(), '{}'::jsonb,
      '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      now(), now(),
      '', '', '', '', ''
    );
    INSERT INTO auth.identities (
      provider_id, user_id, identity_data, provider, created_at, updated_at
    )
    VALUES (
      'admin@example.local', admin_id,
      jsonb_build_object('sub', admin_id::text, 'email', 'admin@example.local'),
      'email', now(), now()
    );
    INSERT INTO profiles (id, display_name, is_admin) VALUES (admin_id, '관리자', true);
  END IF;
END $$;
