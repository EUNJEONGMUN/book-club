-- Phase A · PR 3: invite/apply/approve helpers
-- All SECURITY DEFINER. auth + admin checks live inside each function so
-- server actions can stay thin and we keep policy centralized.

CREATE OR REPLACE FUNCTION rotate_invite(target_club_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  new_token TEXT;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM club_members
    WHERE club_id = target_club_id
      AND user_id = current_user_id
      AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not admin';
  END IF;

  -- Revoke any active invite for this club (soft delete)
  UPDATE club_invites
  SET revoked_at = now()
  WHERE club_id = target_club_id AND revoked_at IS NULL;

  -- Generate new opaque token. UUID format gives ~128 bits of entropy.
  new_token := gen_random_uuid()::TEXT;

  INSERT INTO club_invites (club_id, token, created_by, expires_at)
  VALUES (target_club_id, new_token, current_user_id, now() + INTERVAL '30 days');

  RETURN new_token;
END;
$$;
