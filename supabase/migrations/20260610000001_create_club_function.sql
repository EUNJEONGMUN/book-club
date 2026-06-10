-- Phase A · PR 2: create_club helper
-- SECURITY DEFINER lets the function bypass club_members INSERT-RLS (PR 1 T8)
-- so a single atomic call inserts the club + the creator's admin row.

CREATE OR REPLACE FUNCTION create_club(club_name TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_club_id UUID;
  current_user_id UUID := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF club_name IS NULL OR length(trim(club_name)) = 0 THEN
    RAISE EXCEPTION 'Club name is required';
  END IF;

  INSERT INTO clubs (name, created_by)
  VALUES (trim(club_name), current_user_id)
  RETURNING id INTO new_club_id;

  INSERT INTO club_members (club_id, user_id, role)
  VALUES (new_club_id, current_user_id, 'admin');

  RETURN new_club_id;
END;
$$;
