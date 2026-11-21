-- 관리자 이양 기능 제거. 단일 20인 모임에서 쓰지 않음.
DROP FUNCTION IF EXISTS public.transfer_admin(UUID);
