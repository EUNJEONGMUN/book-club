-- 한줄 평 (감상평) 테이블 + RLS
-- 비공개 기본, 공개 토글. 모임당 사용자당 1개 (UNIQUE).

CREATE TABLE meeting_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (length(content) > 0 AND length(content) <= 200),
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, user_id)
);

CREATE TRIGGER meeting_reviews_updated_at BEFORE UPDATE ON meeting_reviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 미리 뽑는 쿼리: 모임 상세에서 (meeting_id, is_public OR user_id=self) 조회
CREATE INDEX meeting_reviews_meeting_public_idx
  ON meeting_reviews(meeting_id, is_public);

ALTER TABLE meeting_reviews ENABLE ROW LEVEL SECURITY;

-- SELECT 본인 거: 항상 OK
CREATE POLICY meeting_reviews_select_own ON meeting_reviews
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- SELECT 다른 사람 공개 평: 같은 클럽 active 멤버만
CREATE POLICY meeting_reviews_select_public_in_club ON meeting_reviews
  FOR SELECT TO authenticated
  USING (
    is_public = true
    AND EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_id
        AND is_club_member(m.club_id)
    )
  );

-- INSERT 본인 거만, 그리고 자기가 그 모임 클럽 active 멤버여야
CREATE POLICY meeting_reviews_insert_own ON meeting_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_id
        AND is_club_member(m.club_id)
    )
  );

-- UPDATE 본인 거만
CREATE POLICY meeting_reviews_update_own ON meeting_reviews
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE 본인 거만
CREATE POLICY meeting_reviews_delete_own ON meeting_reviews
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
