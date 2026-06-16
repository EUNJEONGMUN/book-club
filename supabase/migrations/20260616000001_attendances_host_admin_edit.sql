-- 모임 호스트와 클럽 admin이 attendances 다른 사람 row도 INSERT/UPDATE 가능하게.
-- 기존 attendances_insert_own_member / attendances_update_own_member는 그대로 유지
-- (RLS INSERT WITH CHECK / UPDATE USING는 OR semantics 이라 가산).
-- 시간 기반 가드(지난 모임 본인 잠금)는 server action body에서 처리 — RLS 부적합.

CREATE POLICY attendances_insert_host ON attendances
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_id AND m.host_id = auth.uid()
    )
  );

CREATE POLICY attendances_update_host ON attendances
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_id AND m.host_id = auth.uid()
    )
  );

CREATE POLICY attendances_insert_club_admin ON attendances
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_id AND is_club_admin(m.club_id)
    )
  );

CREATE POLICY attendances_update_club_admin ON attendances
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_id AND is_club_admin(m.club_id)
    )
  );
