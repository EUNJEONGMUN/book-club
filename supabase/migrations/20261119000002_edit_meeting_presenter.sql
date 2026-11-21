BEGIN;

-- The existing meeting update policy controls who can change the presenter.
GRANT UPDATE (host_id) ON public.meetings TO authenticated;

CREATE FUNCTION public.validate_meeting_presenter_change() RETURNS trigger
LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.members
    WHERE user_id = NEW.host_id AND role IN ('admin', 'member')
  ) THEN
    RAISE EXCEPTION '승인된 멤버만 발제자로 선택할 수 있어요.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER meetings_validate_presenter_change
BEFORE UPDATE OF host_id ON public.meetings
FOR EACH ROW WHEN (OLD.host_id IS DISTINCT FROM NEW.host_id)
EXECUTE FUNCTION public.validate_meeting_presenter_change();

NOTIFY pgrst, 'reload schema';
COMMIT;
