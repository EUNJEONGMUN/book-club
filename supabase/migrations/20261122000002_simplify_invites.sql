-- 초대링크 영구화. 만료 개념을 제거하고 관리자가 수동으로 폐기한다.
-- expires_at 컬럼을 삭제하고, 만료 체크를 하던 모든 RPC를 재정의한다. 수동 폐기용 revoke_invite 추가.

BEGIN;

CREATE OR REPLACE FUNCTION public.rotate_invite() RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE new_token TEXT; BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not admin'; END IF;
 LOCK TABLE public.invites IN SHARE ROW EXCLUSIVE MODE;
 UPDATE public.invites SET revoked_at=now() WHERE revoked_at IS NULL;
 new_token:=gen_random_uuid()::text;
 INSERT INTO public.invites(token,created_by) VALUES(new_token,auth.uid());
 RETURN new_token;
END $$;

CREATE OR REPLACE FUNCTION public.validate_invite_token(invite_token TEXT) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i public.invites%rowtype; r public.member_role; result_status TEXT; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
 SELECT * INTO i FROM public.invites WHERE token=invite_token;
 IF NOT FOUND THEN RETURN json_build_object('status','not_found'); END IF;
 IF i.revoked_at IS NOT NULL THEN RETURN json_build_object('status','revoked'); END IF;
 SELECT role INTO r FROM public.members WHERE user_id=auth.uid();
 result_status:=CASE WHEN r IN ('admin','member') THEN 'already_member' WHEN r='pending' THEN 'already_pending' ELSE 'valid' END;
 RETURN json_build_object('status',result_status,'club_name',(SELECT name FROM public.club_settings WHERE id=1));
END $$;

CREATE OR REPLACE FUNCTION public.apply_for_membership(invite_token TEXT) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i public.invites%rowtype; r public.member_role; inserted_user UUID; result_status TEXT; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
 SELECT * INTO i FROM public.invites WHERE token=invite_token FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invalid invite'; END IF;
 IF i.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'Invite revoked'; END IF;
 INSERT INTO public.members(user_id,role) VALUES(auth.uid(),'pending') ON CONFLICT(user_id) DO NOTHING RETURNING user_id INTO inserted_user;
 SELECT role INTO r FROM public.members WHERE user_id=auth.uid();
 result_status:=CASE WHEN inserted_user IS NOT NULL THEN 'applied' WHEN r='pending' THEN 'already_pending' ELSE 'already_member' END;
 RETURN json_build_object('status',result_status,'club_name',(SELECT name FROM public.club_settings WHERE id=1));
END $$;

CREATE FUNCTION public.revoke_invite() RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not admin'; END IF;
 LOCK TABLE public.invites IN SHARE ROW EXCLUSIVE MODE;
 UPDATE public.invites SET revoked_at=now() WHERE revoked_at IS NULL;
END $$;
REVOKE ALL ON FUNCTION public.revoke_invite() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_invite() TO authenticated;

ALTER TABLE public.invites DROP COLUMN expires_at;

NOTIFY pgrst,'reload schema';
COMMIT;
