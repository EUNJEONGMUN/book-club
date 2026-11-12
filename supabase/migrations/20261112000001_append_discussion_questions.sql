BEGIN;

LOCK TABLE public.discussion_questions IN SHARE ROW EXCLUSIVE MODE;

-- Renumber only meetings that already have collisions, retaining their question order.
WITH affected_meetings AS (
  SELECT DISTINCT meeting_id
  FROM public.discussion_questions
  GROUP BY meeting_id, order_idx
  HAVING count(*) > 1
), ordered_questions AS (
  SELECT q.id, (row_number() OVER (
    PARTITION BY q.meeting_id ORDER BY q.order_idx, q.created_at, q.id
  ) - 1)::integer AS order_idx
  FROM public.discussion_questions q
  JOIN affected_meetings USING (meeting_id)
)
UPDATE public.discussion_questions q
SET order_idx = ordered.order_idx
FROM ordered_questions ordered
WHERE q.id = ordered.id AND q.order_idx <> ordered.order_idx;

DROP INDEX public.discussion_questions_meeting_order_idx;
CREATE UNIQUE INDEX discussion_questions_meeting_order_idx
  ON public.discussion_questions(meeting_id, order_idx);

CREATE FUNCTION public.append_discussion_questions(target_meeting_id uuid, question_contents text[])
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  last_order_idx integer;
BEGIN
  -- Serialize appends to this meeting before reading its last question.
  PERFORM 1 FROM public.meetings
  WHERE id = target_meeting_id AND host_id = (SELECT auth.uid())
  FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Meeting unavailable to this host' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(max(order_idx), -1) INTO last_order_idx
  FROM public.discussion_questions
  WHERE meeting_id = target_meeting_id;

  INSERT INTO public.discussion_questions (meeting_id, order_idx, content)
  SELECT target_meeting_id, last_order_idx + position::integer, content
  FROM unnest(question_contents) WITH ORDINALITY AS question(content, position);
END;
$$;

REVOKE ALL ON FUNCTION public.append_discussion_questions(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.append_discussion_questions(uuid, text[]) TO authenticated;

COMMIT;
