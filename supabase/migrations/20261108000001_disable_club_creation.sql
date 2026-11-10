-- 부글부글 전용 서비스: 화면 외 직접 API 호출로도 그룹을 만들 수 없도록 한다.
BEGIN;

DROP POLICY IF EXISTS clubs_insert_self ON public.clubs;

-- 이미 배포된 클라이언트가 호출하더라도 그룹 생성은 항상 거절한다.
CREATE OR REPLACE FUNCTION public.create_club(club_name TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Group creation is disabled. This service is for 부글부글 only.';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_club(TEXT) FROM PUBLIC, anon, authenticated;

COMMIT;
