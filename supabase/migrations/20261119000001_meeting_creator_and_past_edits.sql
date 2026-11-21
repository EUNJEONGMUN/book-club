BEGIN;

ALTER TABLE public.meetings
  ADD COLUMN created_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.meetings DISABLE TRIGGER meetings_updated_at;
UPDATE public.meetings SET created_by = host_id;
ALTER TABLE public.meetings ENABLE TRIGGER meetings_updated_at;
ALTER TABLE public.meetings ALTER COLUMN created_by SET NOT NULL;
CREATE INDEX meetings_created_by_idx ON public.meetings(created_by);

-- Trusted seed/import callers can keep providing only the presenter.
CREATE FUNCTION public.set_meeting_creator() RETURNS trigger
LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  NEW.created_by := coalesce(NEW.created_by, auth.uid(), NEW.host_id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER meetings_set_creator BEFORE INSERT ON public.meetings
FOR EACH ROW EXECUTE FUNCTION public.set_meeting_creator();

CREATE FUNCTION public.can_edit_meeting(meeting_creator uuid, meeting_time timestamptz)
RETURNS boolean LANGUAGE sql STABLE SET search_path = ''
AS $$
  SELECT public.is_member() AND (
    meeting_creator = (SELECT auth.uid()) OR
    (meeting_time <= now() AND public.is_admin())
  );
$$;
REVOKE ALL ON FUNCTION public.can_edit_meeting(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_meeting(uuid, timestamptz) TO authenticated;

ALTER POLICY meetings_insert ON public.meetings WITH CHECK (
  public.is_member() AND created_by = (SELECT auth.uid())
  AND EXISTS (SELECT 1 FROM public.members WHERE user_id = host_id AND role IN ('admin', 'member'))
);

-- Restrict the writable columns so a past meeting can be rescheduled without a change of owner.
REVOKE UPDATE ON public.meetings FROM authenticated;
GRANT UPDATE (book_title, book_author, book_cover_url, scheduled_at, location_name,
  location_address, location_url, discussion_file_url, discussion_file_name)
ON public.meetings TO authenticated;
ALTER POLICY meetings_update ON public.meetings
  USING (public.can_edit_meeting(created_by, scheduled_at))
  WITH CHECK (public.is_member());
ALTER POLICY meetings_delete ON public.meetings
  USING (public.is_member() AND created_by = (SELECT auth.uid()));

REVOKE UPDATE ON public.discussion_questions FROM authenticated;
GRANT UPDATE (content, order_idx) ON public.discussion_questions TO authenticated;
ALTER POLICY questions_insert ON public.discussion_questions WITH CHECK (
  EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND public.can_edit_meeting(m.created_by, m.scheduled_at))
);
DROP POLICY questions_update ON public.discussion_questions;
CREATE POLICY questions_update ON public.discussion_questions FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND public.can_edit_meeting(m.created_by, m.scheduled_at))
);
ALTER POLICY questions_delete ON public.discussion_questions USING (
  EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND public.can_edit_meeting(m.created_by, m.scheduled_at))
);

CREATE OR REPLACE FUNCTION public.append_discussion_questions(target_meeting_id uuid, question_contents text[])
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  last_order_idx integer;
BEGIN
  -- Serialize appends to this meeting before reading its last question.
  PERFORM 1 FROM public.meetings
  WHERE id = target_meeting_id AND public.can_edit_meeting(created_by, scheduled_at)
  FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Meeting unavailable to this editor' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(max(order_idx), -1) INTO last_order_idx
  FROM public.discussion_questions
  WHERE meeting_id = target_meeting_id;

  INSERT INTO public.discussion_questions (meeting_id, order_idx, content)
  SELECT target_meeting_id, last_order_idx + position::integer, content
  FROM unnest(question_contents) WITH ORDINALITY AS question(content, position);
END;
$$;

-- Existing attendance privileges follow the creator, even with a different presenter.
ALTER POLICY attendance_insert ON public.attendances WITH CHECK (
  public.is_member() AND (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.meetings m WHERE m.id = meeting_id
        AND (m.created_by = (SELECT auth.uid()) OR (user_id = (SELECT auth.uid()) AND m.scheduled_at > now()))
    )
  )
);
DROP POLICY attendance_update ON public.attendances;
CREATE POLICY attendance_update ON public.attendances FOR UPDATE TO authenticated USING (
  public.is_member() AND (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.meetings m WHERE m.id = meeting_id
        AND (m.created_by = (SELECT auth.uid()) OR (user_id = (SELECT auth.uid()) AND m.scheduled_at > now()))
    )
  )
);
ALTER POLICY attendance_delete ON public.attendances USING (
  public.is_member() AND (
    public.is_admin() OR EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND m.created_by = (SELECT auth.uid()))
  )
);

ALTER POLICY "discussion-files upload" ON storage.objects WITH CHECK (
  bucket_id = 'discussion-files' AND EXISTS (
    SELECT 1 FROM public.meetings m WHERE m.id::text = (storage.foldername(name))[1]
      AND public.can_edit_meeting(m.created_by, m.scheduled_at)
  )
);
DROP POLICY "discussion-files update" ON storage.objects;
CREATE POLICY "discussion-files update" ON storage.objects FOR UPDATE TO authenticated USING (
  bucket_id = 'discussion-files' AND EXISTS (
    SELECT 1 FROM public.meetings m WHERE m.id::text = (storage.foldername(name))[1]
      AND public.can_edit_meeting(m.created_by, m.scheduled_at)
  )
);
ALTER POLICY "discussion-files delete" ON storage.objects USING (
  bucket_id = 'discussion-files' AND EXISTS (
    SELECT 1 FROM public.meetings m WHERE m.id::text = (storage.foldername(name))[1]
      AND public.can_edit_meeting(m.created_by, m.scheduled_at)
  )
);

NOTIFY pgrst, 'reload schema';
COMMIT;
