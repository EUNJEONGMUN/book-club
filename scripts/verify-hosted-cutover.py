#!/usr/bin/env python3
"""Rehearse fixed hosted TEST DB guard/backup/recovery; never targets Production."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
import importlib.util
spec = importlib.util.spec_from_file_location("test_cutover", ROOT / "scripts/test-cutover-executor.py")
executor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(executor)
q, ident, require = executor.literal, executor.identifier, executor.require


def canonical(value):
    return sorted(json.dumps(row, ensure_ascii=False, sort_keys=True) for row in value)


class Rehearsal:
    def __init__(self):
        self.run_id = secrets.token_hex(6)
        self.db = "cutover_rehearsal_" + self.run_id
        self.folder = ROOT / ".local-backups" / ("hosted-cutover-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ"))
        self.folder.mkdir(mode=0o700)
        preparation = executor.load("cutover_preparation_evidence", "prepare-single-club-cutover.py")
        self.save("preparation-inputs.json", preparation.build_plan())
        self.connection = executor.TestConnection(allow_writes=True)
        self.checks = []
        self.new_database_created = False
        self.api_barrier_active = False
        self.fixture_user = None
        self.fixture_paths = []
        self.local_container = None

    def save(self, name, value):
        data = value if isinstance(value, bytes) else json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True).encode()
        with (self.folder / name).open("xb") as output:
            output.write(data)
        return {"path": name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}

    def check(self, condition, label):
        require(condition, label)
        self.checks.append(label)

    def local(self, arguments, data=None, check=True):
        result = subprocess.run(arguments, input=data, capture_output=True, timeout=120)
        if check and result.returncode:
            # Never echo SQL/private records/passwords. Store diagnostic text privately.
            self.save("local-error-" + secrets.token_hex(4) + ".log", result.stderr)
            raise RuntimeError("Local archive operation failed; private diagnostic saved.")
        return result

    def sql(self, body, database=None, read_only=False, check=True):
        result = self.connection.sql(body, database or self.db, read_only, check=False)
        if check and result.returncode:
            self.save("sql-error-" + secrets.token_hex(4) + ".log", result.stderr.replace(self.connection.password.encode(), b"[hidden]"))
            raise RuntimeError("Test SQL stage failed; private diagnostic saved.")
        return result

    def control(self, database):
        self.sql("BEGIN; CREATE SCHEMA cutover_test_control; REVOKE ALL ON SCHEMA cutover_test_control FROM PUBLIC,anon,authenticated,service_role;"
                 "CREATE TABLE cutover_test_control.run(id smallint PRIMARY KEY CHECK(id=1),run_id text NOT NULL,stage text NOT NULL);"
                 "INSERT INTO cutover_test_control.run VALUES(1," + q(self.run_id) + ",'prepared'); COMMIT;", database)

    def read_stage(self, database):
        return self.sql("SELECT stage FROM cutover_test_control.run;", database, read_only=True).stdout.decode().strip()

    def verify_guards(self, database):
        result = self.sql("SELECT jsonb_build_object('eligible',count(*),'missing',count(*) FILTER(WHERE NOT EXISTS "
                          "(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=c.oid AND t.tgname='cutover_write_barrier' "
                          "AND t.tgfoid='cutover_guard.reject_writes()'::regprocedure AND t.tgenabled='O'))) "
                          "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN "
                          "('public','auth','storage','legacy_multiclub') AND c.relkind IN ('r','p') "
                          "AND has_table_privilege('postgres',c.oid,'TRIGGER');", database, read_only=True)
        state = json.loads(result.stdout)
        self.check(state["eligible"] > 20 and state["missing"] == 0, "all eligible test tables protected: " + database)
        return state

    def offline_restore(self, archive, expected, label):
        """Restore a real frozen test backup into a new network-none local container."""
        image = self.local(["docker", "inspect", "--format", "{{.Config.Image}}", "supabase_db_book-club"]).stdout.decode().strip()
        require(image.startswith("public.ecr.aws/supabase/postgres:17."), "Expected cached PostgreSQL 17 image.")
        roles = self.local(["docker", "exec", "supabase_db_book-club", "pg_dumpall", "-U", "supabase_admin", "--roles-only", "--no-role-passwords"]).stdout
        require(not re.search(rb"\bPASSWORD\s+'", roles, re.I), "Local role bootstrap contains passwords.")
        roles = roles.replace(b"CREATE ROLE supabase_admin;\n", b"")
        init = "initdb -D /tmp/restore-data -U supabase_admin --auth=trust --encoding=UTF8 --locale=C >/tmp/initdb.log 2>&1 && exec postgres -D /tmp/restore-data -c listen_addresses= -c unix_socket_directories=/tmp -c shared_preload_libraries="
        name = "book-club-hosted-restore-" + self.run_id + "-" + label
        container = self.local(["docker", "run", "--detach", "--pull", "never", "--network", "none", "--name", name,
                                "--label", "book-club.hosted-cutover=true", "--user", "postgres", "--tmpfs", "/tmp:rw,mode=1777,size=536870912",
                                "--entrypoint", "/bin/sh", image, "-c", init]).stdout.decode().strip()
        require(re.fullmatch(r"[a-f0-9]{64}", container), "Unexpected disposable container identity.")
        self.local_container = container
        def inside(args, data=None, check=True):
            return self.local(["docker", "exec", "-i", container, *args], data, check)
        try:
            for _ in range(100):
                if inside(["pg_isready", "-h", "/tmp", "-U", "supabase_admin"], check=False).returncode == 0:
                    break
                time.sleep(0.2)
            else:
                raise RuntimeError("Offline test restore startup failed.")
            def sql(body):
                return inside(["psql", "-h", "/tmp", "-U", "supabase_admin", "-d", "postgres", "-XqAt", "-v", "ON_ERROR_STOP=1"], body.encode()).stdout
            sql(roles.decode())
            listing = self.local(["docker", "exec", "-i", "supabase_db_book-club", "pg_restore", "--list"], archive).stdout.decode()
            included_schemas = set(re.findall(r"^\d+; \d+ \d+ SCHEMA - (\S+) ", listing, re.M))
            # Managed service-owned schemas can be omitted, whereas postgres-owned synthetic schemas are included.
            missing_schemas = {"auth", "storage", "extensions", "supabase_migrations"} - included_schemas
            if missing_schemas:
                sql("".join("CREATE SCHEMA " + ident(name) + ";" for name in sorted(missing_schemas)))
            inside(["pg_restore", "-h", "/tmp", "-U", "supabase_admin", "-d", "postgres", "--exit-on-error"], archive)
            self.check(True, label + " complete frozen backup actually restored offline")
            for table, rows in expected.items():
                schema, name = table.split(".", 1)
                actual = json.loads(sql("SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM " + ident(schema) + "." + ident(name) + " t;"))
                self.check(canonical(rows) == canonical(actual), label + " frozen restore rows match " + table)
            self.check(self.local(["docker", "inspect", "--format", "{{.HostConfig.NetworkMode}}", container]).stdout.strip() == b"none", "restored backup has no external network")
        finally:
            owned = self.local(["docker", "inspect", "--format", '{{index .Config.Labels "book-club.hosted-cutover"}}', container]).stdout.strip()
            if owned == b"true":
                self.local(["docker", "rm", "--force", "--volumes", container])
                self.local_container = None

    def bootstrap_synthetic_database(self):
        c = self.connection
        self.check(c.state()["login_role"] == "postgres", "verified TLS test project postgres login")
        exists = self.sql("SELECT count(*) FROM pg_database WHERE datname=" + q(self.db) + ";", "postgres", read_only=True).stdout.strip()
        self.check(exists == b"0", "new synthetic test DB name did not exist")
        self.sql("CREATE DATABASE " + ident(self.db) + " OWNER postgres;", "postgres")
        self.new_database_created = True
        self.check(c.state(self.db)["database"] == self.db, "new managed test DB identity confirmed")
        self.control(self.db)
        # Extract ONLY schema definitions, never upload production rows or files.
        source = ROOT / ".local-backups/production-dump-20261108T052113760121Z"
        manifest = json.loads((source / "manifest.json").read_bytes())
        archive = (source / "database.dump").read_bytes()
        self.check(hashlib.sha256(archive).hexdigest() == manifest["sha256"], "immutable source archive hash verified")
        schema = self.local(["docker", "exec", "-i", "supabase_db_book-club", "pg_restore", "--schema-only", "--no-owner", "--no-privileges",
                             "--schema=public", "--schema=auth", "--schema=storage", "--schema=supabase_migrations", "--file=-"], archive).stdout
        self.check(not re.search(rb"^COPY |^INSERT INTO ", schema, re.M), "only schema definitions selected for hosted synthetic DB")
        schema = schema.replace(b"CREATE SCHEMA public;", b"")
        self.save("synthetic-schema-only.sql", schema)
        self.sql("CREATE SCHEMA extensions; CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA supabase_migrations; "
                 "CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;")
        self.sql(schema.decode())
        # A fixed synthetic local-seed club UUID accepted by the actual migration;
        # no real production member or activity is sent to this DB.
        self.sql("""BEGIN;
INSERT INTO auth.users(id,email,aud,role,created_at,updated_at)
SELECT ('f5000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'cutover-synthetic-'||n||'@example.invalid','authenticated','authenticated',now(),now() FROM generate_series(1,4) n;
INSERT INTO auth.identities(user_id,provider_id,identity_data,provider) VALUES('f5000000-0000-0000-0000-000000000003','synthetic-google',jsonb_build_object('sub','synthetic-google','email','synthetic@example.invalid'),'google');
INSERT INTO public.profiles(id,display_name) SELECT id,'합성 검증 사용자' FROM auth.users;
INSERT INTO public.clubs(id,name,created_by) VALUES('10000000-0000-0000-0000-000000000001','부글부글 합성 검증','f5000000-0000-0000-0000-000000000001');
INSERT INTO public.club_members(club_id,user_id,role) VALUES
('10000000-0000-0000-0000-000000000001','f5000000-0000-0000-0000-000000000001','admin'),
('10000000-0000-0000-0000-000000000001','f5000000-0000-0000-0000-000000000002','member'),
('10000000-0000-0000-0000-000000000001','f5000000-0000-0000-0000-000000000003','pending');
INSERT INTO public.meetings(id,club_id,host_id,book_title,book_author,location_name,scheduled_at,discussion_file_url,discussion_file_name) VALUES
('f5000000-0000-0000-0000-000000000021','10000000-0000-0000-0000-000000000001','f5000000-0000-0000-0000-000000000001','합성 미래 일정','합성 저자','합성 장소',now()+interval '7 days','https://example.invalid/synthetic.pdf','한글 발제.pdf'),
('f5000000-0000-0000-0000-000000000022','10000000-0000-0000-0000-000000000001','f5000000-0000-0000-0000-000000000004','탈퇴 발제자 과거 일정','합성 저자','합성 장소',now()-interval '7 days',NULL,NULL);
INSERT INTO public.discussion_questions(meeting_id,order_idx,content) VALUES('f5000000-0000-0000-0000-000000000021',0,'합성 질문: **한글**');
INSERT INTO public.attendances(meeting_id,user_id,status) VALUES('f5000000-0000-0000-0000-000000000022','f5000000-0000-0000-0000-000000000002','attending');
INSERT INTO public.meeting_reviews(meeting_id,user_id,content,visibility) VALUES
('f5000000-0000-0000-0000-000000000022','f5000000-0000-0000-0000-000000000001','공개 평','public'),
('f5000000-0000-0000-0000-000000000022','f5000000-0000-0000-0000-000000000002','비공개 평','private'),
('f5000000-0000-0000-0000-000000000022','f5000000-0000-0000-0000-000000000004','익명 평','anonymous');
INSERT INTO public.club_invites(token,club_id,created_by,expires_at,revoked_at) VALUES
('synthetic-expired','10000000-0000-0000-0000-000000000001','f5000000-0000-0000-0000-000000000001',now()-interval '1 day',NULL),
('synthetic-revoked','10000000-0000-0000-0000-000000000001','f5000000-0000-0000-0000-000000000001',now()+interval '1 day',now());
INSERT INTO storage.buckets(id,name,public) VALUES('discussion-files','discussion-files',true);
INSERT INTO storage.objects(bucket_id,name) VALUES('discussion-files','synthetic-only.pdf');
COMMIT;
""")
        versions = sorted(p.stem.split("_", 1) for p in (ROOT / "supabase/migrations").glob("*.sql") if p.name.split("_", 1)[0] <= "20261108000001")
        self.sql("INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES " +
                 ",".join("(" + q(v) + "," + q(n) + ",ARRAY[]::text[])" for v, n in versions) + ";")
        self.check(True, "managed rehearsal contains synthetic users/activities/ledger only")

    def conversion_and_recovery(self):
        self.bootstrap_synthetic_database()
        c = self.connection
        before = c.snapshot(self.db)
        self.save("synthetic-before.json", before)
        self.sql(executor.guarded_sql("install", self.db, self.run_id))
        self.verify_guards(self.db)
        frozen = c.archive(self.db)
        public = c.archive(self.db, public_only=True)
        self.save("synthetic-frozen.dump", frozen)
        self.save("synthetic-public.dump", public)
        self.offline_restore(frozen, before, "synthetic-frozen")
        original_policies = self.sql("SELECT coalesce(jsonb_agg(jsonb_build_object('schema',schemaname,'table',tablename,'name',policyname,'cmd',cmd,'roles',roles,'qual',qual,'check',with_check) ORDER BY schemaname,tablename,policyname),'[]'::jsonb) FROM pg_policies WHERE schemaname IN ('public','storage');", read_only=True).stdout
        defaults = self.sql("SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY oid),'[]'::jsonb) FROM pg_default_acl d WHERE defaclnamespace='public'::regnamespace;", read_only=True).stdout
        oid = self.sql("SELECT 'public'::regnamespace::oid;", read_only=True).stdout
        # Intentionally fail in the middle of a real guarded migration transaction.
        paths = [next((ROOT / "supabase/migrations").glob(v + "_*.sql")) for v in ("20261108000002", "20261108000003", "20261108000004")]
        first = paths[0]
        fail = executor.migration_sql(first.read_text(), self.db, self.run_id, "20261108000002", first.stem.split("_", 1)[1])
        fail = fail.replace("COMMIT;", "SELECT 1/0;\nCOMMIT;")
        result = self.sql(fail, check=False)
        self.check(result.returncode != 0 and b"division by zero" in result.stderr, "injected migration failure rolls back rather than being retried")
        self.check(self.read_stage(self.db) == "frozen" and c.snapshot(self.db) == before, "failed migration preserves every synthetic row and stage/ledger")
        # Advancing out of order must also fail at the SQL stage gate.
        third = paths[2]
        wrong = self.sql(executor.migration_sql(third.read_text(), self.db, self.run_id, "20261108000004", third.stem.split("_", 1)[1]), check=False)
        self.check(wrong.returncode != 0 and b"stage mismatch" in wrong.stderr, "out-of-order migration rejected by database stage gate")
        for path in paths:
            version, name = path.stem.split("_", 1)
            self.sql(executor.migration_sql(path.read_text(), self.db, self.run_id, version, name))
            self.verify_guards(self.db)
        converted = c.snapshot(self.db)
        self.save("synthetic-converted.json", converted)
        for name, rows in before.items():
            if name in ("public.clubs", "public.club_members", "public.club_invites"):
                actual = converted[name.replace("public.", "legacy_multiclub.", 1)]
            elif name == "public.profiles":
                actual = converted["legacy_multiclub.profiles_before_single_club"]
            elif name == "public.meetings":
                actual = converted["legacy_multiclub.meetings_before_single_club"]
            elif name == "supabase_migrations.schema_migrations":
                actual = [r for r in converted[name] if r["version"] <= "20261108000001"]
            else:
                actual = converted[name]
            self.check(canonical(rows) == canonical(actual), "synthetic conversion preserves " + name)
        for old, new, removed in [("public.profiles", "public.profiles", "is_admin"), ("public.meetings", "public.meetings", "club_id"),
                                  ("public.club_members", "public.members", "club_id"), ("public.club_invites", "public.invites", "club_id")]:
            expected = [{k: v for k, v in r.items() if k != removed} for r in before[old]]
            self.check(canonical(expected) == canonical(converted[new]), "synthetic live fields retained in " + new)
        # Extract current frozen public data and restore it transactionally while keeping failed state private.
        public_sql = self.local(["docker", "exec", "-i", "supabase_db_book-club", "pg_restore", "--no-owner", "--schema=public", "--file=-"], public).stdout.decode()
        # Preserve existing managed default ACL objects (the public schema itself remains).
        public_sql = re.sub(r"^ALTER DEFAULT PRIVILEGES[^;]*;\s*", "", public_sql, flags=re.M)
        require("CREATE SCHEMA public;" not in public_sql, "Unexpected public schema creation in recovery.")
        schema = self.local(["docker", "exec", "-i", "supabase_db_book-club", "pg_restore", "--schema-only", "--no-owner", "--no-privileges", "--schema=storage", "--file=-"], frozen).stdout
        policy_definitions = re.findall(rb"^CREATE POLICY .*?;\s*", schema, re.M | re.S)
        storage_policy = b"".join(p for p in policy_definitions if b" ON storage.objects " in p).decode()
        current_policy_names = json.loads(self.sql("SELECT coalesce(jsonb_agg(policyname),'[]'::jsonb) FROM pg_policies WHERE schemaname='storage' AND tablename='objects';", read_only=True).stdout)
        recovery = "BEGIN; SET LOCAL lock_timeout='5s';\n" + executor.assertion(self.db, self.run_id) + executor.stage_assertion(["converted"])
        recovery += """
CREATE SCHEMA cutover_failed_public;
REVOKE ALL ON SCHEMA cutover_failed_public FROM PUBLIC,anon,authenticated,service_role;
DO $move$ DECLARE o record; BEGIN
FOR o IN SELECT relname FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','p') ORDER BY relname LOOP EXECUTE format('ALTER TABLE public.%I SET SCHEMA cutover_failed_public',o.relname); END LOOP;
FOR o IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND prokind='f' LOOP EXECUTE format('ALTER FUNCTION %s SET SCHEMA cutover_failed_public',o.signature); END LOOP;
FOR o IN SELECT typname FROM pg_type WHERE typnamespace='public'::regnamespace AND typtype IN ('e','d') LOOP EXECUTE format('ALTER TYPE public.%I SET SCHEMA cutover_failed_public',o.typname); END LOOP;
FOR o IN SELECT relname FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='S' LOOP EXECUTE format('ALTER SEQUENCE public.%I SET SCHEMA cutover_failed_public',o.relname); END LOOP;
END $move$;
""" + public_sql + "\n"
        recovery += "".join("DROP POLICY " + ident(name) + " ON storage.objects;\n" for name in current_policy_names) + storage_policy
        recovery += "CREATE TABLE cutover_failed_public.migration_history AS TABLE supabase_migrations.schema_migrations; DELETE FROM supabase_migrations.schema_migrations WHERE version IN ('20261108000002','20261108000003','20261108000004');\n"
        recovery += executor.guarded_sql("attach", self.db, self.run_id) + "UPDATE cutover_test_control.run SET stage='recovered'; COMMIT;\n"
        self.save("synthetic-recovery.sql", recovery.encode())
        self.sql(recovery)
        recovered = c.snapshot(self.db)
        for name, rows in before.items():
            self.check(canonical(rows) == canonical(recovered[name]), "hosted recovery restores every original synthetic row: " + name)
        for name, rows in converted.items():
            if name.startswith("public."):
                self.check(canonical(rows) == canonical(recovered[name.replace("public.", "cutover_failed_public.", 1)]), "failed state kept privately: " + name)
        self.check(canonical(converted["supabase_migrations.schema_migrations"]) == canonical(recovered["cutover_failed_public.migration_history"]), "failed migration ledger kept privately")
        now_policies = self.sql("SELECT coalesce(jsonb_agg(jsonb_build_object('schema',schemaname,'table',tablename,'name',policyname,'cmd',cmd,'roles',roles,'qual',qual,'check',with_check) ORDER BY schemaname,tablename,policyname),'[]'::jsonb) FROM pg_policies WHERE schemaname IN ('public','storage');", read_only=True).stdout
        self.check(original_policies == now_policies, "hosted public and Storage RLS policies exactly restored")
        self.check(defaults == self.sql("SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY oid),'[]'::jsonb) FROM pg_default_acl d WHERE defaclnamespace='public'::regnamespace;", read_only=True).stdout
                   and oid == self.sql("SELECT 'public'::regnamespace::oid;", read_only=True).stdout, "public schema OID and managed default ACL remain unchanged")
        self.verify_guards(self.db)
        premature = self.sql(executor.guarded_sql("remove", self.db, self.run_id), check=False)
        self.check(premature.returncode != 0 and b"stage mismatch" in premature.stderr, "barrier cannot be removed before recovery verification checkpoint")
        self.sql("UPDATE cutover_test_control.run SET stage='recovered_verified';")
        self.sql(executor.guarded_sql("remove", self.db, self.run_id))
        self.check(self.read_stage(self.db) == "resumed", "recovered test DB barrier removed after verified recovery")
        late = self.sql(recovery, check=False)
        self.check(late.returncode != 0 and b"stage mismatch" in late.stderr, "old recovery SQL refused after writes were resumed")
        self.save("synthetic-recovered.json", c.snapshot(self.db))

    def run(self):
        self.before_preview = self.connection.snapshot()
        self.save("preview-before.json", self.before_preview)
        self.save("preview-before.dump", self.connection.archive())
        print("Verified TEST project; original test records/backups captured. Preparing a separate synthetic database.", flush=True)
        self.conversion_and_recovery()
        print("Synthetic managed DB conversion/recovery verified. Checking the managed TEST APIs next.", flush=True)
        http_module = executor.load("hosted_cutover_http", "hosted-cutover-http.py")
        http_module.run(self, executor)
        after = self.connection.snapshot()
        for name, rows in self.before_preview.items():
            self.check(set(canonical(rows)).issubset(set(canonical(after[name]))), "all original hosted Preview rows preserved: " + name)
            if name.startswith(("public.", "legacy_multiclub.", "supabase_migrations.")) or name in ("auth.users", "auth.identities", "auth.sessions", "auth.refresh_tokens", "storage.objects", "storage.buckets"):
                self.check(canonical(rows) == canonical(after[name]), "no leftover test fixture rows: " + name)
        additions = {name: [row for row in rows if json.dumps(row, ensure_ascii=False, sort_keys=True) not in set(canonical(self.before_preview.get(name, [])))] for name, rows in after.items()}
        additions = {name: rows for name, rows in additions.items() if rows}
        self.save("controlled-fixture-additions.json", additions)
        self.check(all(name == "auth.audit_log_entries" and all(self.run_id in json.dumps(row) or getattr(self, "completed_fixture_user", "missing") in json.dumps(row) for row in rows) for name, rows in additions.items()), "only attributable synthetic Auth audit events may remain")
        self.save("preview-after.json", after)
        # Only the newly created synthetic DB, never the existing test DB, can be dropped.
        require(self.new_database_created and executor.valid_database(self.db) and self.db != "postgres", "Cleanup target mismatch.")
        self.sql(executor.assertion(self.db, self.run_id) + executor.stage_assertion(["resumed"]), read_only=True)
        self.save("synthetic-final.dump", self.connection.archive(self.db))
        # Keep the new synthetic DB for review; no automatic remote database deletion.
        report = {"passed": True, "project_ref": executor.TEST_REF, "production_connection_used": False,
                  "deployments_created": 0, "existing_preview_rows_preserved": True,
                  "synthetic_database_cleaned": False, "synthetic_database_retained": self.db, "checks": self.checks,
                  "managed_api_barrier_tested": True, "production_ready": False,
                  "completed_at": datetime.now(timezone.utc).isoformat()}
        self.save("verification-report.json", report)
        print(json.dumps({"passed": True, "checks": len(self.checks), "report": str(self.folder / "verification-report.json")}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", action="store_true", help="Run only in the fixed hosted TEST project")
    parser.add_argument("--cleanup-failed", type=Path, help="Archive/drop only a newly created failed synthetic DB, never Preview postgres")
    parser.add_argument("--cleanup-fixture", type=Path, help="Clean only the failed run's new Auth user and exact file paths")
    parser.add_argument("--archive-failed", type=Path, help="Read and archive a failed synthetic DB without deleting it")
    args = parser.parse_args()
    os.umask(0o077)
    if args.archive_failed:
        require(not args.run and not args.cleanup_failed and not args.cleanup_fixture, "Choose a single test action.")
        cleanup_failed(args.archive_failed, archive_only=True)
        return
    if args.cleanup_fixture:
        require(not args.run and not args.cleanup_failed, "Choose a single test action.")
        cleanup_fixture(args.cleanup_fixture)
        return
    if args.cleanup_failed:
        require(not args.run, "Choose run or failed synthetic cleanup.")
        cleanup_failed(args.cleanup_failed)
        return
    if not args.run:
        print("Inspection only. Run scripts/test-cutover-executor.py for read-only TLS/target verification.")
        return
    rehearsal = None
    try:
        rehearsal = Rehearsal()
        rehearsal.run()
    except Exception as error:
        if rehearsal:
            rehearsal.save("verification-failure.json", {"passed": False, "error": str(error) if isinstance(error, RuntimeError) else type(error).__name__,
                "checks": rehearsal.checks, "test_database": rehearsal.db, "test_database_retained": rehearsal.new_database_created,
                "api_barrier_active": rehearsal.api_barrier_active, "production_connection_used": False,
                "fixture_user": rehearsal.fixture_user, "fixture_paths": rehearsal.fixture_paths, "run_id": rehearsal.run_id})
        print("Hosted TEST rehearsal stopped; state/backups retained. " + (str(rehearsal.folder) if rehearsal else type(error).__name__))
        raise SystemExit(1)


def cleanup_failed(folder, archive_only=False):
    folder = folder.resolve()
    require(folder.parent == ROOT / ".local-backups" and folder.name.startswith("hosted-cutover-"), "Unexpected private test report folder.")
    state = json.loads((folder / "verification-failure.json").read_bytes())
    database = state["test_database"]
    require(state["passed"] is False and state["production_connection_used"] is False
            and not state["api_barrier_active"]
            and state["test_database_retained"] is True and database != "postgres"
            and executor.valid_database(database), "Only this run's synthetic database is eligible for cleanup.")
    if state.get("fixture_user"):
        cleaned = json.loads((folder / "fixture-cleanup.json").read_bytes())
        require(cleaned["fixture_user"] == state["fixture_user"] and cleaned["cleaned"] is True, "Finish owned fixture cleanup first.")
    run_id = database.removeprefix("cutover_rehearsal_")
    connection = executor.TestConnection(allow_writes=True)
    connection.state(database)
    connection.sql(executor.assertion(database, run_id), database, read_only=True)
    archive = connection.archive(database)
    artifact = executor.ro.save(folder, "retained-synthetic-final.dump", archive)
    if archive_only:
        executor.ro.save(folder, "synthetic-archive-only.json", {"project_ref": executor.TEST_REF, "database": database,
                        "archived": artifact, "database_deleted": False, "stage": connection.sql("SELECT stage FROM cutover_test_control.run;", database, read_only=True).stdout.decode().strip()})
        print("Synthetic DB identity/backup verified. No database deletion was sent.")
        return
    connection.sql("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=" + q(database) + " AND usename='postgres' AND state='idle' AND backend_type='client backend';")
    connection.sql("DROP DATABASE " + ident(database) + ";")
    executor.ro.save(folder, "synthetic-cleanup.json", {"project_ref": executor.TEST_REF, "database": database,
                    "archived_before_drop": artifact, "cleaned": True, "existing_preview_database_changed": False})
    print("Only the newly created synthetic database was archived and cleaned. Existing Preview records preserved.")


def cleanup_fixture(folder):
    """Recovery command for a failed test; never resets or overwrites original rows."""
    folder = folder.resolve()
    require(folder.parent == ROOT / ".local-backups" and folder.name.startswith("hosted-cutover-"), "Unexpected test report folder.")
    state = json.loads((folder / "verification-failure.json").read_bytes())
    run_id, user = state["run_id"], state["fixture_user"]
    require(state["passed"] is False and state["production_connection_used"] is False and not state["api_barrier_active"]
            and re.fullmatch(r"[a-f0-9]{12}", run_id) and re.fullmatch(r"[a-f0-9-]{36}", user), "Unexpected test fixture identity.")
    expected_paths = ["cutover-test-" + run_id + "/" + name for name in ("fixture.pdf", "signed.pdf", "resumable.pdf")]
    require(state["fixture_paths"] == expected_paths, "Unexpected fixture file paths.")
    connection = executor.TestConnection(allow_writes=True)
    require(connection.sql("SELECT to_regnamespace('cutover_guard') IS NULL;", read_only=True).stdout.strip() == b"t", "Barrier still active; do not run fixture cleanup.")
    before = json.loads((folder / "preview-before.json").read_bytes())
    current = connection.snapshot()
    require(all(set(canonical(rows)).issubset(set(canonical(current[name]))) for name, rows in before.items()), "Original rows changed; retain current state for investigation.")
    from urllib.request import Request, build_opener, HTTPSHandler
    import ssl
    from urllib.error import HTTPError
    opener = build_opener(executor.ro.NoRedirect(), HTTPSHandler(context=ssl.create_default_context(cafile="/etc/ssl/cert.pem")))
    headers = {"apikey": connection.keys["anon"], "Authorization": "Bearer " + connection.keys["service_role"], "Content-Type": "application/json"}
    def request(method, path, body=None):
        try:
            with opener.open(Request("https://" + executor.TEST_REF + ".supabase.co" + path,
                                     data=None if body is None else json.dumps(body).encode(), headers=headers, method=method), timeout=45) as response:
                require(response.status == 200, "Fixture cleanup API response mismatch.")
                return json.loads(response.read())
        except HTTPError:
            raise RuntimeError("Fixture cleanup API failed; do not retry blindly.") from None
    live = request("GET", "/auth/v1/admin/users/" + user)
    require(live.get("user_metadata", {}).get("cutover_run") == run_id, "Fixture ownership metadata mismatch.")
    request("DELETE", "/storage/v1/object/discussion-files", {"prefixes": expected_paths})
    request("DELETE", "/auth/v1/admin/users/" + user)
    connection.sql(executor.assertion("postgres", run_id) + executor.stage_assertion(["resumed"]) + "DROP SCHEMA cutover_test_control CASCADE;")
    after = connection.snapshot()
    require(all(set(canonical(rows)).issubset(set(canonical(after[name]))) for name, rows in before.items()), "Original rows no longer match.")
    require(all(canonical(rows) == canonical(after[name]) for name, rows in before.items()
                if name.startswith(("public.", "legacy_multiclub.", "supabase_migrations.")) or name in ("auth.users", "auth.identities", "storage.objects", "storage.buckets")), "Visible fixture cleanup incomplete.")
    executor.ro.save(folder, "fixture-cleanup.json", {"project_ref": executor.TEST_REF, "fixture_user": user,
                    "cleaned": True, "all_original_rows_preserved": True, "exact_fixture_files_removed": True,
                    "failed_run_incomplete_tus_resource": "incomplete temporary resource may remain until managed expiry; no original object modified"})
    print("Only this run's synthetic user and visible files were cleaned; every original row was preserved.")


if __name__ == "__main__":
    main()
