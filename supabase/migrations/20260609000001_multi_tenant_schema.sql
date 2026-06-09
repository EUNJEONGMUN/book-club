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
