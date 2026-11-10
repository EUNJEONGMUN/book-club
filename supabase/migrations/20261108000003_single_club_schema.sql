-- Phase 2. Transactional, data-preserving conversion of the retained 부글부글 club.
-- Back up the complete database and storage BEFORE applying. No CASCADE or row DELETE.
-- Unrelated clubs are archived, never merged into service membership.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
LOCK TABLE public.clubs, public.club_members, public.club_invites, public.profiles,
 public.meetings, public.discussion_questions, public.attendances, public.meeting_reviews
 IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE retained_club ON COMMIT DROP AS
 SELECT * FROM public.clubs WHERE id IN (
  '7504fd29-94ee-4134-b4f6-d7adb25fb2ac'::uuid, -- verified original production club
  '10000000-0000-0000-0000-000000000001'::uuid  -- local seed club
 );
DO $$ BEGIN
 IF (SELECT count(*) FROM retained_club) <> 1 AND (EXISTS(SELECT 1 FROM public.clubs) OR EXISTS(SELECT 1 FROM public.profiles) OR EXISTS(SELECT 1 FROM public.meetings)) THEN
  RAISE EXCEPTION 'Exactly one verified retained club UUID is required; no changes applied';
 END IF;
 IF EXISTS (SELECT 1 FROM public.meetings WHERE club_id <> (SELECT id FROM retained_club)) THEN
  RAISE EXCEPTION 'Other clubs have meetings. Archive/migrate them explicitly first; no changes applied';
 END IF;
 IF EXISTS(SELECT 1 FROM retained_club) AND NOT EXISTS (SELECT 1 FROM public.club_members WHERE club_id=(SELECT id FROM retained_club) AND role='admin') THEN
  RAISE EXCEPTION 'Retained club must have an administrator';
 END IF;
END $$;

CREATE SCHEMA legacy_multiclub;
REVOKE ALL ON SCHEMA legacy_multiclub FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE legacy_multiclub.profiles_before_single_club AS SELECT * FROM public.profiles;
CREATE TABLE legacy_multiclub.meetings_before_single_club AS SELECT * FROM public.meetings;
CREATE TEMP TABLE preserved_activity ON COMMIT DROP AS
 SELECT 'questions' AS kind, to_jsonb(q) AS data FROM public.discussion_questions q
 UNION ALL SELECT 'attendance', to_jsonb(a) FROM public.attendances a
 UNION ALL SELECT 'reviews', to_jsonb(r) FROM public.meeting_reviews r;

CREATE TYPE public.member_role AS ENUM ('admin','member','pending');
CREATE TABLE public.club_settings (
 id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id=1),
 legacy_club_id UUID NOT NULL UNIQUE,
 name TEXT NOT NULL,
 description TEXT,
 created_by UUID NOT NULL REFERENCES public.profiles(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.club_settings
 SELECT 1, id, name, description, created_by, created_at, updated_at FROM retained_club;
CREATE TRIGGER club_settings_updated_at BEFORE UPDATE ON public.club_settings
 FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TABLE public.members (
 user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 role public.member_role NOT NULL,
 joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.members(user_id,role,joined_at)
 SELECT user_id,role::text::public.member_role,joined_at FROM public.club_members
 WHERE club_id=(SELECT id FROM retained_club);
CREATE TABLE public.invites (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 token TEXT NOT NULL UNIQUE,
 created_by UUID NOT NULL REFERENCES public.profiles(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 expires_at TIMESTAMPTZ NOT NULL DEFAULT now()+interval '30 days',
 revoked_at TIMESTAMPTZ
);
INSERT INTO public.invites(id,token,created_by,created_at,expires_at,revoked_at)
 SELECT id,token,created_by,created_at,expires_at,revoked_at FROM public.club_invites
 WHERE club_id=(SELECT id FROM retained_club);
CREATE INDEX invites_active_idx ON public.invites(created_at DESC) WHERE revoked_at IS NULL;

-- Replace only the policies belonging to the old membership model.
DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT tablename,policyname FROM pg_policies WHERE schemaname='public'
 AND tablename IN ('clubs','club_members','club_invites','meetings','discussion_questions','attendances','meeting_reviews')
 LOOP EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename); END LOOP;
END $$;
DROP FUNCTION public.create_club(TEXT);
DROP FUNCTION public.apply_to_club(TEXT);
DROP FUNCTION public.validate_invite_token(TEXT);
DROP FUNCTION public.rotate_invite(UUID);
DROP FUNCTION public.transfer_admin(UUID,UUID);
DROP FUNCTION public.get_club_admin_emails(UUID);
DROP FUNCTION public.is_club_member(UUID);
DROP FUNCTION public.is_club_admin(UUID);

-- Keep the original tables, complete memberships and invites in a private schema.
ALTER TABLE public.club_members SET SCHEMA legacy_multiclub;
ALTER TABLE public.club_invites SET SCHEMA legacy_multiclub;
ALTER TABLE public.clubs SET SCHEMA legacy_multiclub;
ALTER TYPE public.club_member_role SET SCHEMA legacy_multiclub;
ALTER TABLE public.meetings DROP COLUMN club_id;
ALTER TABLE public.profiles DROP COLUMN is_admin;
REVOKE ALL ON ALL TABLES IN SCHEMA legacy_multiclub FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.is_member() RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.members WHERE user_id=auth.uid() AND role IN ('admin','member')); $$;
CREATE FUNCTION public.is_admin() RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.members WHERE user_id=auth.uid() AND role='admin'); $$;
ALTER TABLE public.club_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.club_settings,public.members,public.invites FROM anon,authenticated;
GRANT SELECT ON public.club_settings TO authenticated;
GRANT UPDATE(name,description) ON public.club_settings TO authenticated;
GRANT SELECT,DELETE ON public.members TO authenticated;
GRANT UPDATE(role) ON public.members TO authenticated;
GRANT SELECT ON public.invites TO authenticated;
GRANT ALL ON public.club_settings,public.members,public.invites TO service_role;
CREATE POLICY settings_read ON public.club_settings FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.members WHERE user_id=auth.uid()));
CREATE POLICY settings_update ON public.club_settings FOR UPDATE TO authenticated
 USING(public.is_admin()) WITH CHECK(public.is_admin());
CREATE POLICY members_read ON public.members FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.is_member());
CREATE POLICY members_approve ON public.members FOR UPDATE TO authenticated
 USING(public.is_admin() AND role='pending') WITH CHECK(public.is_admin() AND role='member');
CREATE POLICY members_leave_or_reject ON public.members FOR DELETE TO authenticated
 USING(role<>'admin' AND (user_id=auth.uid() OR public.is_admin()));
CREATE POLICY invites_read ON public.invites FOR SELECT TO authenticated USING(public.is_admin());

CREATE POLICY meetings_read ON public.meetings FOR SELECT TO authenticated USING(public.is_member());
CREATE POLICY meetings_insert ON public.meetings FOR INSERT TO authenticated WITH CHECK(public.is_member() AND host_id=auth.uid());
CREATE POLICY meetings_update ON public.meetings FOR UPDATE TO authenticated
 USING(public.is_member() AND host_id=auth.uid()) WITH CHECK(public.is_member() AND host_id=auth.uid());
CREATE POLICY meetings_delete ON public.meetings FOR DELETE TO authenticated USING(public.is_member() AND host_id=auth.uid());
CREATE POLICY questions_read ON public.discussion_questions FOR SELECT TO authenticated USING(public.is_member());
CREATE POLICY questions_insert ON public.discussion_questions FOR INSERT TO authenticated WITH CHECK(public.is_member() AND EXISTS(SELECT 1 FROM public.meetings m WHERE m.id=meeting_id AND m.host_id=auth.uid()));
CREATE POLICY questions_update ON public.discussion_questions FOR UPDATE TO authenticated
 USING(public.is_member() AND EXISTS(SELECT 1 FROM public.meetings m WHERE m.id=meeting_id AND m.host_id=auth.uid()))
 WITH CHECK(public.is_member() AND EXISTS(SELECT 1 FROM public.meetings m WHERE m.id=meeting_id AND m.host_id=auth.uid()));
CREATE POLICY questions_delete ON public.discussion_questions FOR DELETE TO authenticated USING(public.is_member() AND EXISTS(SELECT 1 FROM public.meetings m WHERE m.id=meeting_id AND m.host_id=auth.uid()));
CREATE POLICY attendance_read ON public.attendances FOR SELECT TO authenticated USING(public.is_member());
CREATE POLICY attendance_insert ON public.attendances FOR INSERT TO authenticated WITH CHECK(public.is_member() AND (user_id=auth.uid() OR public.is_admin() OR EXISTS(SELECT 1 FROM public.meetings m WHERE m.id=meeting_id AND m.host_id=auth.uid())));
CREATE POLICY attendance_update ON public.attendances FOR UPDATE TO authenticated
 USING(public.is_member() AND (user_id=auth.uid() OR public.is_admin() OR EXISTS(SELECT 1 FROM public.meetings m WHERE m.id=meeting_id AND m.host_id=auth.uid())))
 WITH CHECK(public.is_member() AND (user_id=auth.uid() OR public.is_admin() OR EXISTS(SELECT 1 FROM public.meetings m WHERE m.id=meeting_id AND m.host_id=auth.uid())));
CREATE POLICY attendance_delete ON public.attendances FOR DELETE TO authenticated USING(public.is_member() AND (public.is_admin() OR EXISTS(SELECT 1 FROM public.meetings m WHERE m.id=meeting_id AND m.host_id=auth.uid())));
CREATE POLICY reviews_read ON public.meeting_reviews FOR SELECT TO authenticated USING(user_id=auth.uid() OR (public.is_member() AND visibility IN ('public','anonymous')));
CREATE POLICY reviews_insert ON public.meeting_reviews FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND public.is_member() AND EXISTS(SELECT 1 FROM public.meetings m WHERE m.id=meeting_id));
CREATE POLICY reviews_update ON public.meeting_reviews FOR UPDATE TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY reviews_delete ON public.meeting_reviews FOR DELETE TO authenticated USING(user_id=auth.uid());

CREATE FUNCTION public.rotate_invite() RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE new_token TEXT; BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not admin'; END IF;
 LOCK TABLE public.invites IN SHARE ROW EXCLUSIVE MODE;
 UPDATE public.invites SET revoked_at=now() WHERE revoked_at IS NULL;
 new_token:=gen_random_uuid()::text;
 INSERT INTO public.invites(token,created_by) VALUES(new_token,auth.uid());
 RETURN new_token;
END $$;
CREATE FUNCTION public.validate_invite_token(invite_token TEXT) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i public.invites%rowtype; r public.member_role; result_status TEXT; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
 SELECT * INTO i FROM public.invites WHERE token=invite_token;
 IF NOT FOUND THEN RETURN json_build_object('status','not_found'); END IF;
 IF i.revoked_at IS NOT NULL THEN RETURN json_build_object('status','revoked'); END IF;
 IF i.expires_at<=now() THEN RETURN json_build_object('status','expired'); END IF;
 SELECT role INTO r FROM public.members WHERE user_id=auth.uid();
 result_status:=CASE WHEN r IN ('admin','member') THEN 'already_member' WHEN r='pending' THEN 'already_pending' ELSE 'valid' END;
 RETURN json_build_object('status',result_status,'club_name',(SELECT name FROM public.club_settings WHERE id=1));
END $$;
CREATE FUNCTION public.apply_for_membership(invite_token TEXT) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i public.invites%rowtype; r public.member_role; inserted_user UUID; result_status TEXT; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
 SELECT * INTO i FROM public.invites WHERE token=invite_token FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invalid invite'; END IF;
 IF i.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'Invite revoked'; END IF;
 IF i.expires_at<=now() THEN RAISE EXCEPTION 'Invite expired'; END IF;
 INSERT INTO public.members(user_id,role) VALUES(auth.uid(),'pending') ON CONFLICT(user_id) DO NOTHING RETURNING user_id INTO inserted_user;
 SELECT role INTO r FROM public.members WHERE user_id=auth.uid();
 result_status:=CASE WHEN inserted_user IS NOT NULL THEN 'applied' WHEN r='pending' THEN 'already_pending' ELSE 'already_member' END;
 RETURN json_build_object('status',result_status,'club_name',(SELECT name FROM public.club_settings WHERE id=1));
END $$;
CREATE FUNCTION public.transfer_admin(new_admin_user_id UUID) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.member_role; BEGIN
 LOCK TABLE public.members IN SHARE ROW EXCLUSIVE MODE;
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not admin'; END IF;
 IF new_admin_user_id=auth.uid() THEN RAISE EXCEPTION 'Cannot transfer admin to yourself'; END IF;
 SELECT role INTO r FROM public.members WHERE user_id=new_admin_user_id;
 IF r IS NULL THEN RAISE EXCEPTION 'Target user is not a member'; END IF;
 IF r='pending' THEN RAISE EXCEPTION 'Target user is still pending approval'; END IF;
 UPDATE public.members SET role='member' WHERE user_id=auth.uid();
 UPDATE public.members SET role='admin' WHERE user_id=new_admin_user_id;
END $$;
CREATE FUNCTION public.get_admin_emails() RETURNS TABLE(email TEXT) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT u.email::text FROM public.members m JOIN auth.users u ON u.id=m.user_id WHERE m.role='admin' AND u.email IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.is_member(),public.is_admin(),public.rotate_invite(),public.validate_invite_token(TEXT),public.apply_for_membership(TEXT),public.transfer_admin(UUID),public.get_admin_emails() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.is_member(),public.is_admin(),public.rotate_invite(),public.validate_invite_token(TEXT),public.apply_for_membership(TEXT),public.transfer_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_emails() TO service_role;

-- Preserve the existing meeting-ID paths and public download URLs. Restrict writes to hosts.
DROP POLICY IF EXISTS "discussion-files read" ON storage.objects;
DROP POLICY IF EXISTS "discussion-files upload" ON storage.objects;
DROP POLICY IF EXISTS "discussion-files update" ON storage.objects;
DROP POLICY IF EXISTS "discussion-files delete" ON storage.objects;
CREATE POLICY "discussion-files read" ON storage.objects FOR SELECT TO authenticated USING(bucket_id='discussion-files' AND public.is_member());
CREATE POLICY "discussion-files upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='discussion-files' AND public.is_member() AND EXISTS(SELECT 1 FROM public.meetings m WHERE m.id::text=(storage.foldername(name))[1] AND m.host_id=auth.uid()));
CREATE POLICY "discussion-files update" ON storage.objects FOR UPDATE TO authenticated
 USING(bucket_id='discussion-files' AND public.is_member() AND EXISTS(SELECT 1 FROM public.meetings m WHERE m.id::text=(storage.foldername(name))[1] AND m.host_id=auth.uid()))
 WITH CHECK(bucket_id='discussion-files' AND public.is_member() AND EXISTS(SELECT 1 FROM public.meetings m WHERE m.id::text=(storage.foldername(name))[1] AND m.host_id=auth.uid()));
CREATE POLICY "discussion-files delete" ON storage.objects FOR DELETE TO authenticated USING(bucket_id='discussion-files' AND public.is_member() AND EXISTS(SELECT 1 FROM public.meetings m WHERE m.id::text=(storage.foldername(name))[1] AND m.host_id=auth.uid()));

-- Fail the whole transaction if any retained field, membership or activity changed.
DO $$ BEGIN
 IF EXISTS (
  (SELECT to_jsonb(m)-'club_id' FROM legacy_multiclub.meetings_before_single_club m EXCEPT SELECT to_jsonb(m) FROM public.meetings m)
  UNION ALL (SELECT to_jsonb(m) FROM public.meetings m EXCEPT SELECT to_jsonb(m)-'club_id' FROM legacy_multiclub.meetings_before_single_club m)
 ) THEN RAISE EXCEPTION 'Meeting preservation check failed'; END IF;
 IF EXISTS (
  (SELECT to_jsonb(p)-'is_admin' FROM legacy_multiclub.profiles_before_single_club p EXCEPT SELECT to_jsonb(p) FROM public.profiles p)
  UNION ALL (SELECT to_jsonb(p) FROM public.profiles p EXCEPT SELECT to_jsonb(p)-'is_admin' FROM legacy_multiclub.profiles_before_single_club p)
 ) THEN RAISE EXCEPTION 'Profile preservation check failed'; END IF;
 IF EXISTS (
  (SELECT to_jsonb(m)-'club_id' FROM legacy_multiclub.club_members m WHERE club_id=(SELECT id FROM retained_club) EXCEPT SELECT to_jsonb(m) FROM public.members m)
  UNION ALL (SELECT to_jsonb(m) FROM public.members m EXCEPT SELECT to_jsonb(m)-'club_id' FROM legacy_multiclub.club_members m WHERE club_id=(SELECT id FROM retained_club))
 ) THEN RAISE EXCEPTION 'Membership preservation check failed'; END IF;
 IF EXISTS (
  (SELECT to_jsonb(i)-'club_id' FROM legacy_multiclub.club_invites i WHERE club_id=(SELECT id FROM retained_club) EXCEPT SELECT to_jsonb(i) FROM public.invites i)
  UNION ALL (SELECT to_jsonb(i) FROM public.invites i EXCEPT SELECT to_jsonb(i)-'club_id' FROM legacy_multiclub.club_invites i WHERE club_id=(SELECT id FROM retained_club))
 ) THEN RAISE EXCEPTION 'Invite preservation check failed'; END IF;
 IF EXISTS (
  (SELECT * FROM preserved_activity EXCEPT (SELECT 'questions',to_jsonb(q) FROM public.discussion_questions q UNION ALL SELECT 'attendance',to_jsonb(a) FROM public.attendances a UNION ALL SELECT 'reviews',to_jsonb(r) FROM public.meeting_reviews r))
  UNION ALL ((SELECT 'questions',to_jsonb(q) FROM public.discussion_questions q UNION ALL SELECT 'attendance',to_jsonb(a) FROM public.attendances a UNION ALL SELECT 'reviews',to_jsonb(r) FROM public.meeting_reviews r) EXCEPT SELECT * FROM preserved_activity)
 ) THEN RAISE EXCEPTION 'Activity preservation check failed'; END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
