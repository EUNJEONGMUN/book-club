-- Pending applicants need to see their own pending row so clubs_select_pending's
-- EXISTS clause can match. Existing club_members_select_member only exposes rows
-- to active members (admin/member) — pending applicants need a self-scoped read.
-- Additive (OR semantics across SELECT policies).

CREATE POLICY club_members_select_own_pending ON club_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND role = 'pending');
