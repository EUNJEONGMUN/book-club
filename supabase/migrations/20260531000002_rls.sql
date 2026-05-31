-- 모든 테이블 RLS 활성화
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendances ENABLE ROW LEVEL SECURITY;
ALTER TABLE discussion_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY profiles_select ON profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY profiles_update_own ON profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY profiles_insert_own ON profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- meetings
CREATE POLICY meetings_select ON meetings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY meetings_insert ON meetings
  FOR INSERT TO authenticated WITH CHECK (host_id = auth.uid());
CREATE POLICY meetings_update_host ON meetings
  FOR UPDATE TO authenticated USING (host_id = auth.uid()) WITH CHECK (host_id = auth.uid());
CREATE POLICY meetings_delete_host ON meetings
  FOR DELETE TO authenticated USING (host_id = auth.uid());

-- attendances
CREATE POLICY attendances_select ON attendances
  FOR SELECT TO authenticated USING (true);
CREATE POLICY attendances_upsert_own ON attendances
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY attendances_update_own ON attendances
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- discussion_questions
CREATE POLICY questions_select ON discussion_questions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY questions_insert_host ON discussion_questions
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM meetings WHERE meetings.id = meeting_id AND meetings.host_id = auth.uid())
  );
CREATE POLICY questions_update_host ON discussion_questions
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM meetings WHERE meetings.id = meeting_id AND meetings.host_id = auth.uid())
  );
CREATE POLICY questions_delete_host ON discussion_questions
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM meetings WHERE meetings.id = meeting_id AND meetings.host_id = auth.uid())
  );

-- invites
CREATE POLICY invites_select_own ON invites
  FOR SELECT TO authenticated USING (created_by = auth.uid());
CREATE POLICY invites_insert_own ON invites
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
-- UPDATE는 service role로만 (가입 Server Action에서 처리)
