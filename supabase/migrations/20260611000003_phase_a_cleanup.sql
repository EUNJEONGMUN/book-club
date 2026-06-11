-- Phase A · PR 5: cleanup migration
-- 1. Replace legacy RLS on meetings / attendances / discussion_questions with
--    club-membership-scoped policies. (host_id-based write checks stay; SELECT becomes
--    "must be an active member of the meeting's club".)
-- 2. Make meetings.club_id NOT NULL (PR 1 backfill already populated every row).
-- 3. Drop profiles.approved — the column is no longer read by any code path after PR 5.

BEGIN;

-- =====================================================
-- meetings
-- =====================================================
DROP POLICY IF EXISTS meetings_select ON meetings;
DROP POLICY IF EXISTS meetings_insert ON meetings;
DROP POLICY IF EXISTS meetings_update_host ON meetings;
DROP POLICY IF EXISTS meetings_delete_host ON meetings;

CREATE POLICY meetings_select_member ON meetings
  FOR SELECT TO authenticated
  USING (is_club_member(club_id));

CREATE POLICY meetings_insert_member_host ON meetings
  FOR INSERT TO authenticated
  WITH CHECK (host_id = auth.uid() AND is_club_member(club_id));

CREATE POLICY meetings_update_host ON meetings
  FOR UPDATE TO authenticated
  USING (host_id = auth.uid() AND is_club_member(club_id))
  WITH CHECK (host_id = auth.uid() AND is_club_member(club_id));

CREATE POLICY meetings_delete_host ON meetings
  FOR DELETE TO authenticated
  USING (host_id = auth.uid() AND is_club_member(club_id));

-- =====================================================
-- attendances (scope via meeting → club)
-- =====================================================
DROP POLICY IF EXISTS attendances_select ON attendances;
DROP POLICY IF EXISTS attendances_upsert_own ON attendances;
DROP POLICY IF EXISTS attendances_update_own ON attendances;

CREATE POLICY attendances_select_member ON attendances
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = attendances.meeting_id AND is_club_member(m.club_id)
    )
  );

CREATE POLICY attendances_insert_own_member ON attendances
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_id AND is_club_member(m.club_id)
    )
  );

CREATE POLICY attendances_update_own_member ON attendances
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = attendances.meeting_id AND is_club_member(m.club_id)
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = attendances.meeting_id AND is_club_member(m.club_id)
    )
  );

-- =====================================================
-- discussion_questions (scope via meeting → club + host writes)
-- =====================================================
DROP POLICY IF EXISTS questions_select ON discussion_questions;
DROP POLICY IF EXISTS questions_insert_host ON discussion_questions;
DROP POLICY IF EXISTS questions_update_host ON discussion_questions;
DROP POLICY IF EXISTS questions_delete_host ON discussion_questions;

CREATE POLICY questions_select_member ON discussion_questions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = discussion_questions.meeting_id AND is_club_member(m.club_id)
    )
  );

CREATE POLICY questions_insert_host_member ON discussion_questions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_id
        AND m.host_id = auth.uid()
        AND is_club_member(m.club_id)
    )
  );

CREATE POLICY questions_update_host_member ON discussion_questions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = discussion_questions.meeting_id
        AND m.host_id = auth.uid()
        AND is_club_member(m.club_id)
    )
  );

CREATE POLICY questions_delete_host_member ON discussion_questions
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = discussion_questions.meeting_id
        AND m.host_id = auth.uid()
        AND is_club_member(m.club_id)
    )
  );

-- =====================================================
-- meetings.club_id NOT NULL
-- =====================================================
ALTER TABLE meetings ALTER COLUMN club_id SET NOT NULL;

-- =====================================================
-- profiles.approved DROP
-- =====================================================
ALTER TABLE profiles DROP COLUMN approved;

COMMIT;
