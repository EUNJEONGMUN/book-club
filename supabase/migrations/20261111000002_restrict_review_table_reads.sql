-- Switch the app to get_meeting_reviews before restricting the old read path.
ALTER POLICY reviews_read ON public.meeting_reviews
  USING (user_id = (SELECT auth.uid()));
