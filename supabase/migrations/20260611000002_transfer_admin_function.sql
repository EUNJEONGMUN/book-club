-- Phase A · PR 4: transfer_admin helper
-- Atomically swaps the current admin to 'member' and promotes another active member to 'admin'.
-- SECURITY DEFINER so the function bypasses the per-row UPDATE policy on club_members and runs
-- the swap as one transaction (no race where the club briefly has two admins or zero).

CREATE OR REPLACE FUNCTION transfer_admin(target_club_id UUID, new_admin_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  new_admin_role club_member_role;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF current_user_id = new_admin_user_id THEN
    RAISE EXCEPTION 'Cannot transfer admin to yourself';
  END IF;

  -- Caller must be the current admin of this club
  IF NOT EXISTS (
    SELECT 1 FROM club_members
    WHERE club_id = target_club_id
      AND user_id = current_user_id
      AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not admin';
  END IF;

  -- Target must already be an active member (admin or member) of this club
  SELECT role INTO new_admin_role
  FROM club_members
  WHERE club_id = target_club_id AND user_id = new_admin_user_id;

  IF new_admin_role IS NULL THEN
    RAISE EXCEPTION 'Target user is not in this club';
  END IF;
  IF new_admin_role = 'pending' THEN
    RAISE EXCEPTION 'Target user is still pending approval';
  END IF;

  -- Atomic swap
  UPDATE club_members
  SET role = 'member'
  WHERE club_id = target_club_id AND user_id = current_user_id;

  UPDATE club_members
  SET role = 'admin'
  WHERE club_id = target_club_id AND user_id = new_admin_user_id;
END;
$$;
