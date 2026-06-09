-- Phase A · PR 1: multi-tenant schema (additive only — existing tables/policies untouched)
-- See docs/superpowers/specs/2026-06-09-multi-tenant-clubs-design.md

-- Membership role enum
CREATE TYPE club_member_role AS ENUM ('admin', 'member', 'pending');

-- 그룹 (groups는 SQL reserved word라 clubs로)
CREATE TABLE clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER clubs_updated_at BEFORE UPDATE ON clubs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 멤버십. role로 active member(admin/member)와 가입 신청(pending) 구분
-- composite PK (club_id, user_id): 한 그룹에 한 사용자는 한 row
CREATE TABLE club_members (
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role club_member_role NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id, user_id)
);

CREATE INDEX club_members_user_idx ON club_members(user_id);

-- 초대링크. 재발급 이력 보존을 위해 row는 여러 개 가능
-- active invite는 revoked_at IS NULL AND expires_at > now()로 정의 (앱 코드에서 한 그룹당 1개 유지)
CREATE TABLE club_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  revoked_at TIMESTAMPTZ
);

-- partial index: active invite lookups
CREATE INDEX club_invites_active_by_club_idx
  ON club_invites(club_id) WHERE revoked_at IS NULL;

-- meetings에 club_id 추가 (PR 1에서는 nullable; 데이터 backfill 후 NOT NULL은 PR 5 cleanup에서)
-- ON DELETE CASCADE: 그룹 삭제 시 그 그룹의 모든 모임도 함께 삭제
ALTER TABLE meetings ADD COLUMN club_id UUID REFERENCES clubs(id) ON DELETE CASCADE;
CREATE INDEX meetings_club_id_idx ON meetings(club_id);

-- Helper: 현재 사용자가 특정 club의 active member(admin 또는 member)인가?
CREATE OR REPLACE FUNCTION is_club_member(target_club_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM club_members
    WHERE club_id = target_club_id
      AND user_id = auth.uid()
      AND role IN ('admin', 'member')
  );
$$;

-- Helper: 현재 사용자가 특정 club의 admin인가?
CREATE OR REPLACE FUNCTION is_club_admin(target_club_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM club_members
    WHERE club_id = target_club_id
      AND user_id = auth.uid()
      AND role = 'admin'
  );
$$;

-- RLS: clubs
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;

-- SELECT: 자신이 active member(admin/member)인 그룹만
CREATE POLICY clubs_select_member ON clubs
  FOR SELECT TO authenticated
  USING (is_club_member(id));

-- INSERT: 인증된 사용자 누구나. created_by는 자기 자신이어야 함
CREATE POLICY clubs_insert_self ON clubs
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- UPDATE: admin만 (이름/설명 수정)
CREATE POLICY clubs_update_admin ON clubs
  FOR UPDATE TO authenticated
  USING (is_club_admin(id))
  WITH CHECK (is_club_admin(id));

-- DELETE: admin만
CREATE POLICY clubs_delete_admin ON clubs
  FOR DELETE TO authenticated
  USING (is_club_admin(id));

-- RLS: club_members
ALTER TABLE club_members ENABLE ROW LEVEL SECURITY;

-- SELECT: 자신이 active member인 그룹의 모든 member row (pending 포함, admin이 신청자 보려면 필요)
CREATE POLICY club_members_select_member ON club_members
  FOR SELECT TO authenticated
  USING (is_club_member(club_id));

-- INSERT: RLS로는 금지. 모든 INSERT는 server action(SECURITY DEFINER 함수)에서만
--   - 그룹 만들기: admin row INSERT (server action에서 트랜잭션으로)
--   - 가입 신청: pending row INSERT (server action이 token 검증 후 우회)
-- 정책을 아예 만들지 않으면 RLS 활성화된 테이블은 service role만 INSERT 가능

-- UPDATE: admin만 그 그룹의 row 변경 (pending → member 승인, admin↔member 이양)
CREATE POLICY club_members_update_admin ON club_members
  FOR UPDATE TO authenticated
  USING (is_club_admin(club_id))
  WITH CHECK (is_club_admin(club_id));

-- DELETE: 본인 row 삭제 (탈퇴) OR admin이 다른 멤버 삭제
CREATE POLICY club_members_delete_self_or_admin ON club_members
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR is_club_admin(club_id));
