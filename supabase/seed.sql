-- 로컬 개발용 관리자 계정
-- 운영 환경에서는 실행하지 않음
-- 부글부글 전용 로컬 테스트 데이터. 재실행해도 기존 기록은 덮어쓰지 않는다.
DO $$
DECLARE
  admin_id UUID := '00000000-0000-0000-0000-000000000001';
  old_club_id UUID := '10000000-0000-0000-0000-000000000001';
BEGIN
  -- 이미 같은 이메일로 가입한 로컬 관리자가 있으면 그 계정을 사용한다.
  SELECT id INTO admin_id FROM auth.users WHERE email = 'admin@example.local';
  admin_id := coalesce(admin_id, '00000000-0000-0000-0000-000000000001'::uuid);
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
      admin_id::text, admin_id,
      jsonb_build_object('sub', admin_id::text, 'email', 'admin@example.local', 'email_verified', true),
      'email', now(), now()
    );
  END IF;

  INSERT INTO profiles (id, display_name) VALUES (admin_id, '로컬 관리자')
  ON CONFLICT (id) DO NOTHING;

  -- 일반 사용자용 그룹 생성은 차단되어 있으므로 로컬 시드는 DB 소유자로 실행한다.
  INSERT INTO club_settings (id, legacy_club_id, name, created_by) VALUES (1, old_club_id, '부글부글', admin_id)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO members (user_id, role) VALUES (admin_id, 'admin')
  ON CONFLICT DO NOTHING;

  INSERT INTO meetings (id, host_id, book_title, book_author, scheduled_at, location_name)
  VALUES
    ('20000000-0000-0000-0000-000000000001', admin_id,
     '[로컬 테스트] 데미안', '헤르만 헤세', now() + interval '7 days', '테스트 카페'),
    ('20000000-0000-0000-0000-000000000002', admin_id,
     '[로컬 테스트] 어린 왕자', '생텍쥐페리', now() - interval '7 days', '테스트 도서관')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO discussion_questions (id, meeting_id, order_idx, content)
  VALUES ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
          0, '가장 인상 깊었던 장면과 그 이유를 이야기해 주세요.')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO invites (id, token, created_by, expires_at)
  VALUES ('40000000-0000-0000-0000-000000000001', 'bugeul-local-invite', admin_id, now() + interval '30 days')
  ON CONFLICT (id) DO NOTHING;
END $$;
