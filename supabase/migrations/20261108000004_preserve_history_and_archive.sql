-- Harden the single-club model without changing a single existing record.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
LOCK TABLE public.attendances, public.meetings IN SHARE ROW EXCLUSIVE MODE;

-- Self-service attendance is only writable for a future meeting. Host/admin corrections remain valid.
DROP POLICY IF EXISTS attendance_insert ON public.attendances;
DROP POLICY IF EXISTS attendance_update ON public.attendances;
CREATE POLICY attendance_insert ON public.attendances FOR INSERT TO authenticated
 WITH CHECK (public.is_member() AND (
  public.is_admin() OR EXISTS(SELECT 1 FROM public.meetings m WHERE m.id=meeting_id AND m.host_id=auth.uid())
  OR (user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.meetings m WHERE m.id=meeting_id AND m.scheduled_at>now()))
 ));
CREATE POLICY attendance_update ON public.attendances FOR UPDATE TO authenticated
 USING (public.is_member() AND (
  public.is_admin() OR EXISTS(SELECT 1 FROM public.meetings m WHERE m.id=meeting_id AND m.host_id=auth.uid())
  OR (user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.meetings m WHERE m.id=meeting_id AND m.scheduled_at>now()))
 ))
 WITH CHECK (public.is_member() AND (
  public.is_admin() OR EXISTS(SELECT 1 FROM public.meetings m WHERE m.id=meeting_id AND m.host_id=auth.uid())
  OR (user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.meetings m WHERE m.id=meeting_id AND m.scheduled_at>now()))
 ));

-- An archive must not cascade with, or block deletion from, the live account/profile model.
DO $$ DECLARE c record; BEGIN
 FOR c IN
  SELECT n.nspname,t.relname,k.conname FROM pg_constraint k
  JOIN pg_class t ON t.oid=k.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
  JOIN pg_class parent ON parent.oid=k.confrelid JOIN pg_namespace pn ON pn.oid=parent.relnamespace
  WHERE k.contype='f' AND n.nspname='legacy_multiclub' AND pn.nspname<>'legacy_multiclub'
 LOOP EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I',c.nspname,c.relname,c.conname); END LOOP;
END $$;
CREATE FUNCTION legacy_multiclub.reject_writes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Archived records are read-only' USING ERRCODE='55000'; END;
$$;
REVOKE ALL ON FUNCTION legacy_multiclub.reject_writes() FROM PUBLIC, anon, authenticated, service_role;
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='legacy_multiclub'
 LOOP EXECUTE format('CREATE TRIGGER archive_read_only BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON legacy_multiclub.%I FOR EACH STATEMENT EXECUTE FUNCTION legacy_multiclub.reject_writes()',t.tablename); END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
