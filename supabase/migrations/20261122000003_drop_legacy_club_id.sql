-- 레거시 그룹 URL 리다이렉트 라우트를 모두 제거했으므로 보존하던 옛 UUID도 삭제.
ALTER TABLE public.club_settings DROP COLUMN legacy_club_id;
NOTIFY pgrst,'reload schema';
