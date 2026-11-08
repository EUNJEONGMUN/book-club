-- Single-club service: protect all retained records from cascading group deletion.
-- No rows, IDs, foreign keys or existing membership policies are changed.
BEGIN;
DROP POLICY IF EXISTS clubs_delete_admin ON public.clubs;
COMMIT;
