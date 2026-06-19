-- meeting_reviews.is_public(boolean) → visibility(enum) 으로 확장.
-- 'private' / 'public' / 'anonymous' 3-state. anonymous는 다른 멤버는 보지만
-- 작성자 정보는 숨김 (server-side masking — RLS는 row 단위만, column 마스킹은 application).

-- 1) 정책이 is_public 참조 중이라 column drop 전에 정책부터 정리
DROP POLICY IF EXISTS meeting_reviews_select_public_in_club ON meeting_reviews;

-- 2) enum + 컬럼 추가
CREATE TYPE review_visibility AS ENUM ('private', 'public', 'anonymous');

ALTER TABLE meeting_reviews ADD COLUMN visibility review_visibility;

-- 3) 기존 is_public 값으로 backfill
UPDATE meeting_reviews
SET visibility = CASE
  WHEN is_public THEN 'public'::review_visibility
  ELSE 'private'::review_visibility
END;

ALTER TABLE meeting_reviews ALTER COLUMN visibility SET NOT NULL;
ALTER TABLE meeting_reviews ALTER COLUMN visibility SET DEFAULT 'private';

-- 4) 옛 컬럼 + 옛 인덱스 제거
ALTER TABLE meeting_reviews DROP COLUMN is_public;

DROP INDEX IF EXISTS meeting_reviews_meeting_public_idx;

CREATE INDEX meeting_reviews_meeting_visibility_idx
  ON meeting_reviews(meeting_id, visibility);

-- 5) 새 SELECT 정책 — public + anonymous 모두 같은 클럽 멤버에게 노출
CREATE POLICY meeting_reviews_select_visible_in_club ON meeting_reviews
  FOR SELECT TO authenticated
  USING (
    visibility IN ('public', 'anonymous')
    AND EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_id
        AND is_club_member(m.club_id)
    )
  );
