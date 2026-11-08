#!/usr/bin/env python3
"""SQL for disposable LOCAL rehearsals only; not an operational freeze command."""
import sys

DATABASES = {'runtime_verified', 'single_club_rehearsal'}


def local_assertion(database):
    if database not in DATABASES:
        raise ValueError('Only fixed disposable rehearsal databases are allowed.')
    return ("DO $$ BEGIN IF current_database()<>'" + database + "' OR session_user<>'postgres' "
            "THEN RAISE EXCEPTION 'Local rehearsal only'; END IF; END $$;\n")


def attach(database):
    return local_assertion(database) + """
DO $guard$
DECLARE t record;
BEGIN
 FOR t IN SELECT n.nspname,c.relname,c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('public','auth','storage','legacy_multiclub') AND c.relkind IN ('r','p')
 AND has_table_privilege('postgres',c.oid,'TRIGGER') ORDER BY n.nspname,c.relname
 LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=t.oid AND tgname='cutover_write_barrier') THEN
   EXECUTE format('CREATE TRIGGER cutover_write_barrier BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON %I.%I FOR EACH STATEMENT EXECUTE FUNCTION cutover_guard.reject_writes()',t.nspname,t.relname);
  ELSIF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=t.oid AND tgname='cutover_write_barrier' AND tgfoid='cutover_guard.reject_writes()'::regprocedure) THEN
   RAISE EXCEPTION 'Conflicting guard name';
  END IF;
 END LOOP;
END $guard$;
"""


def install(database):
    return "BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';\n" + local_assertion(database) + """
CREATE SCHEMA cutover_guard;
REVOKE ALL ON SCHEMA cutover_guard FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION cutover_guard.reject_writes() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF session_user <> 'postgres' THEN RAISE EXCEPTION USING ERRCODE='PT503', MESSAGE='Temporary write barrier active'; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION cutover_guard.reject_writes() FROM PUBLIC,anon,authenticated,service_role;
""" + attach(database) + 'COMMIT;\n'


def remove(database):
    return "BEGIN; SET LOCAL lock_timeout='5s';\n" + local_assertion(database) + """
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgfoid='cutover_guard.reject_writes()'::regprocedure AND tgname<>'cutover_write_barrier') THEN
  RAISE EXCEPTION 'Unexpected dependency on guard function';
 END IF;
END $$;
DROP FUNCTION cutover_guard.reject_writes() CASCADE;
DROP SCHEMA cutover_guard;
COMMIT;
"""


def guard_migration(body, database):
    import re
    # Keep the original transaction, adding guards for new tables BEFORE its commit.
    if len(re.findall(r'^BEGIN;\s*$', body, re.M)) != 1 or len(re.findall(r'^COMMIT;\s*$', body, re.M)) != 1:
        raise ValueError('Expected one explicit migration transaction.')
    match = re.search(r'^COMMIT;\s*\Z', body, re.M)
    if not match:
        raise ValueError('Final COMMIT must end the migration.')
    return body[:match.start()] + attach(database) + body[match.start():]


if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[1] not in ('install', 'remove', 'attach'):
        raise SystemExit('Local SQL generator: install|remove|attach <fixed rehearsal DB>')
    print({'install': install, 'remove': remove, 'attach': attach}[sys.argv[1]](sys.argv[2]))
