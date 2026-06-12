-- apply_to_club now returns status to differentiate freshly-applied from
-- already-member / already-pending. Matches validate_invite_token's pattern.
-- Replaces ON CONFLICT DO NOTHING with explicit pre-check.

CREATE OR REPLACE FUNCTION apply_to_club(invite_token TEXT)
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
    RAISE EXCEPTION 'Invalid invite';
  END IF;
  IF invite_row.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invite revoked';
  END IF;
  IF invite_row.expires_at <= now() THEN
    RAISE EXCEPTION 'Invite expired';
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

  INSERT INTO club_members (club_id, user_id, role)
  VALUES (invite_row.club_id, current_user_id, 'pending');

  RETURN json_build_object(
    'status', 'applied',
    'club_id', club_row.id,
    'club_name', club_row.name
  );
END;
$$;
