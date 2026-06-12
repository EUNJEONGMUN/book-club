-- Pending applicants need to see their pending club's name on /clubs page.
-- Additive policy — RLS uses OR semantics across SELECT policies, so this
-- coexists with clubs_select_member.
-- Note: requires club_members_select_own_pending (migration 003) so the
-- EXISTS clause can actually find the row at query time.

CREATE POLICY clubs_select_pending ON clubs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM club_members
      WHERE club_id = id
        AND user_id = auth.uid()
        AND role = 'pending'
    )
  );
