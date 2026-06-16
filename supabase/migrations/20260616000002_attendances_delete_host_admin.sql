-- 호스트/admin이 attendances 행 DELETE 가능하게.
-- (기존엔 본인 거 DELETE 정책도 없었음 — 본인 토글은 INSERT/UPDATE upsert로 처리)
-- 호스트/admin은 지난 모임 정정 시 행을 완전히 지우고 다시 추가하는 흐름이 필요.

CREATE POLICY attendances_delete_host ON attendances
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_id AND m.host_id = auth.uid()
    )
  );

CREATE POLICY attendances_delete_club_admin ON attendances
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_id AND is_club_admin(m.club_id)
    )
  );
