-- Read other members' reviews through a projection that never returns an
-- anonymous author's identity. The caller cannot filter the underlying rows.
CREATE FUNCTION public.get_meeting_reviews(target_meeting_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  display_name text,
  avatar_url text,
  content text,
  visibility public.review_visibility,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    review.id,
    CASE WHEN review.visibility <> 'anonymous' OR review.user_id = caller.id
      THEN review.user_id END,
    CASE WHEN review.visibility = 'anonymous' AND review.user_id <> caller.id
      THEN '익명' ELSE profile.display_name END,
    CASE WHEN review.visibility <> 'anonymous' OR review.user_id = caller.id
      THEN profile.avatar_url END,
    review.content,
    review.visibility,
    review.created_at,
    review.updated_at
  FROM public.meeting_reviews AS review
  JOIN public.profiles AS profile ON profile.id = review.user_id
  CROSS JOIN (SELECT auth.uid() AS id) AS caller
  WHERE caller.id IS NOT NULL
    AND (SELECT public.is_member())
    AND review.meeting_id = target_meeting_id
    AND (review.user_id = caller.id OR review.visibility IN ('public', 'anonymous'));
$$;

REVOKE ALL ON FUNCTION public.get_meeting_reviews(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_meeting_reviews(uuid) TO authenticated;
