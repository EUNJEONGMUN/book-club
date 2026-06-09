-- Phase A · PR 1: data migration (default club + member backfill + meetings.club_id backfill)
-- See docs/superpowers/specs/2026-06-09-multi-tenant-clubs-design.md

-- 1. default '부글부글' 그룹 INSERT. EUNJEONGMUN이 admin
--    auth.users.email 기준으로 찾아서 portable (local에 같은 email 없으면 0 row insert)
INSERT INTO clubs (name, created_by)
SELECT '부글부글', id FROM auth.users WHERE email = 'scone@ignite.co.kr'
ON CONFLICT DO NOTHING;

-- 2. 기존 approved 사용자 모두 default 그룹의 멤버로
--    scone@ignite.co.kr은 admin, 나머지는 member
INSERT INTO club_members (club_id, user_id, role)
SELECT
  (SELECT id FROM clubs WHERE name = '부글부글' LIMIT 1),
  p.id,
  CASE WHEN u.email = 'scone@ignite.co.kr' THEN 'admin'::club_member_role
       ELSE 'member'::club_member_role END
FROM profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.approved = true
  AND EXISTS (SELECT 1 FROM clubs WHERE name = '부글부글')
ON CONFLICT (club_id, user_id) DO NOTHING;

-- 3. 기존 모임 모두 default 그룹 소속으로
UPDATE meetings
SET club_id = (SELECT id FROM clubs WHERE name = '부글부글' LIMIT 1)
WHERE club_id IS NULL
  AND EXISTS (SELECT 1 FROM clubs WHERE name = '부글부글');
