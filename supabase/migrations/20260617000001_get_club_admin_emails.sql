-- 클럽 admin들의 이메일 주소를 가져오는 SECURITY DEFINER 함수.
-- auth.users는 일반 RLS로 접근 불가 → SECURITY DEFINER로 우회.
-- 가입 신청 알림 이메일 발송 시 사용 (server action에서 호출).
-- search_path 고정 + SECURITY DEFINER이므로 read-only 보장.

CREATE OR REPLACE FUNCTION get_club_admin_emails(target_club_id UUID)
RETURNS TABLE(email TEXT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.email::text
  FROM club_members cm
  JOIN auth.users u ON u.id = cm.user_id
  WHERE cm.club_id = target_club_id
    AND cm.role = 'admin'
    AND u.email IS NOT NULL;
$$;
