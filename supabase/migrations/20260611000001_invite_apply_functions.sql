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

CREATE OR REPLACE FUNCTION validate_invite_token(invite_token TEXT)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_row club_invites%ROWTYPE;
  club_row clubs%ROWTYPE;
  current_user_id UUID := auth.uid();
  membership_role club_member_role;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO invite_row FROM club_invites WHERE token = invite_token LIMIT 1;
  IF NOT FOUND THEN
    RETURN json_build_object('status', 'not_found');
  END IF;

  IF invite_row.revoked_at IS NOT NULL THEN
    RETURN json_build_object('status', 'revoked');
  END IF;

  IF invite_row.expires_at <= now() THEN
    RETURN json_build_object('status', 'expired');
  END IF;

  SELECT * INTO club_row FROM clubs WHERE id = invite_row.club_id;

  SELECT role INTO membership_role
  FROM club_members
  WHERE club_id = invite_row.club_id AND user_id = current_user_id;

  IF membership_role IN ('admin', 'member') THEN
    RETURN json_build_object(
      'status', 'already_member',
      'club_id', club_row.id,
      'club_name', club_row.name
    );
  END IF;

  IF membership_role = 'pending' THEN
    RETURN json_build_object(
      'status', 'already_pending',
      'club_id', club_row.id,
      'club_name', club_row.name
    );
  END IF;

  RETURN json_build_object(
    'status', 'valid',
    'club_id', club_row.id,
    'club_name', club_row.name
  );
END;
$$;
