#!/usr/bin/env python3
"""Fixed hosted TEST project transport and guarded SQL. No Production target exists."""
import base64
import importlib.util
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
TEST_REF = "teecqonbbmsritclbcyc"
TEST_NAME = "book-club-preview"
HOST = "aws-0-ap-northeast-2.pooler.supabase.com"
PRIVATE = ROOT / ".local-backups/preview-isolation-20261108T112238765928Z"
MIGRATIONS = {
    "20261108000002": ("disable_club_deletion", "1cc205421a5035425dda77a76c617d31df19388f58388112f8edc23e0c3cdde0"),
    "20261108000003": ("single_club_schema", "d8b86cf0f5b73b8e5e2ece32b23d64fb3d6ff0b41aeaaa2d042975fdc40e6ccb"),
    "20261108000004": ("preserve_history_and_archive", "fdb75711d104cb48f4ec978aa8564c21d5987e5c7c3bf5647d7809e391843779"),
}


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ro = load("cutover_read_transport", "production-readonly-backup.py")
dump = load("cutover_dump_transport", "production-db-dump.py")
guard = load("cutover_local_guard", "write-barrier-sql.py")


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def valid_database(database):
    return database == "postgres" or re.fullmatch(r"cutover_rehearsal_[a-f0-9]{12}", database) is not None


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def identifier(value):
    return '"' + value.replace('"', '""') + '"'


def assertion(database, run_id):
    require(valid_database(database) and re.fullmatch(r"[a-f0-9]{12}", run_id), "Invalid fixed test run target.")
    return ("DO $$ BEGIN IF current_database()<>" + literal(database) + " OR session_user<>'postgres' "
            "OR (SELECT run_id FROM cutover_test_control.run) IS DISTINCT FROM " + literal(run_id) +
            " THEN RAISE EXCEPTION 'Test target/run mismatch'; END IF; END $$;\n")


def guarded_sql(action, database, run_id):
    require(action in ("install", "attach", "remove"), "Unknown guard action.")
    local = "single_club_rehearsal"
    sql = getattr(guard, action)(local)
    marker = guard.local_assertion(local)
    require(marker in sql, "Local guard implementation changed.")
    sql = sql.replace(marker, assertion(database, run_id))
    if action == "install":
        sql = sql.replace("CREATE SCHEMA cutover_guard;", stage_assertion(["prepared"]) + "CREATE SCHEMA cutover_guard;")
        sql = sql.replace("COMMIT;", "UPDATE cutover_test_control.run SET stage='frozen';\nCOMMIT;")
    elif action == "remove":
        sql = sql.replace("DROP FUNCTION cutover_guard.reject_writes() CASCADE;",
                          stage_assertion(["readback_verified", "recovered_verified"]) +
                          "DROP FUNCTION cutover_guard.reject_writes() CASCADE;")
        sql = sql.replace("COMMIT;", "UPDATE cutover_test_control.run SET stage='resumed';\nCOMMIT;")
    return sql


def stage_assertion(stages):
    return ("DO $$ BEGIN IF (SELECT stage FROM cutover_test_control.run) IS NULL OR "
            "(SELECT stage FROM cutover_test_control.run) NOT IN (" + ",".join(map(literal, stages)) +
            ") THEN RAISE EXCEPTION 'Test stage mismatch'; END IF; END $$;\n")


def migration_sql(body, database, run_id, version, name):
    require(database != "postgres" and valid_database(database), "Conversion requires a newly created test DB.")
    require(version in ("20261108000002", "20261108000003", "20261108000004"), "Unknown migration.")
    require((name, hashlib.sha256(body.encode()).hexdigest()) == MIGRATIONS[version], "Migration source differs from verified rehearsal.")
    sql = guard.guard_migration(body, "single_club_rehearsal")
    sql = sql.replace(guard.local_assertion("single_club_rehearsal"), assertion(database, run_id))
    ledger = ("INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ("
              + literal(version) + "," + literal(name) + ",ARRAY[" + literal(body) + "]::text[]);\n")
    marker = sql.rindex("COMMIT;")
    previous = {"20261108000002": "frozen", "20261108000003": "migrated02", "20261108000004": "migrated03"}
    next_stage = {"20261108000002": "migrated02", "20261108000003": "migrated03", "20261108000004": "converted"}
    sql = sql[:marker] + ledger + "UPDATE cutover_test_control.run SET stage=" + literal(next_stage[version]) + ";\n" + sql[marker:]
    return sql.replace("BEGIN;", "BEGIN;\n" + stage_assertion([previous[version]]), 1)


class TestConnection:
    def __init__(self, project_ref=TEST_REF, allow_writes=False):
        require(project_ref == TEST_REF, "Only the fixed isolated test project is allowed.")
        project = json.loads((PRIVATE / "created-project.json").read_bytes())
        credentials = json.loads((PRIVATE / "test-db-credentials.json").read_bytes())
        require(project["id"] == TEST_REF and project["name"] == TEST_NAME
                and credentials["project_name"] == TEST_NAME, "Test credential metadata mismatch.")
        self.password = credentials["database_password"]
        require(isinstance(self.password, str) and self.password, "Missing existing TEST password.")
        self.payload = dump.connection_input(self.password)
        self.allow_writes = allow_writes
        self.headers = {"Authorization": "Bearer " + ro.access_token(), "Content-Type": "application/json"}
        self.base = "https://api.supabase.com/v1/projects/" + TEST_REF
        live = json.loads(ro.request(self.base, self.headers))
        require(live["id"] == TEST_REF and live["name"] == TEST_NAME, "Live test identity mismatch.")
        poolers = json.loads(ro.request(self.base + "/config/database/pooler", self.headers))
        require(any(p.get("db_host") == HOST and p.get("db_user") == "postgres." + TEST_REF for p in poolers),
                "Unexpected test pooler metadata.")
        keys = json.loads((PRIVATE / "test-api-keys.json").read_bytes())
        require(keys["project_ref"] == TEST_REF and keys["url"] == "https://" + TEST_REF + ".supabase.co",
                "Test API key host mismatch.")
        for role in ("anon", "service_role"):
            part = keys[role].split(".")[1]
            claims = json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))
            require(claims.get("ref") == TEST_REF and claims.get("role") == role, "Test API key project mismatch.")
        self.keys = keys

    def command(self, program, database, extra):
        require(valid_database(database), "Unrecognized test DB name.")
        return dump.docker_command() + [program, "--host", HOST, "--port", "5432", "--username",
                "postgres." + TEST_REF, "--dbname", database, "--no-password", *extra]

    def sql(self, body, database="postgres", read_only=False, check=True):
        require(read_only or self.allow_writes, "Inspection cannot execute writes.")
        if read_only:
            body = "BEGIN READ ONLY;\n" + body + "\nROLLBACK;"
        # SQL goes through stdin after the cert/password, never a process argument.
        result = subprocess.run(self.command("psql", database, ["-X", "-qAt", "-v", "ON_ERROR_STOP=1"]),
                                input=self.payload + body.encode(), capture_output=True, timeout=120)
        if check and result.returncode:
            raise RuntimeError("Test SQL failed; no automatic retry. Code " + str(result.returncode))
        return result

    def state(self, database="postgres"):
        result = self.sql("SELECT jsonb_build_object('database',current_database(),'login_role',session_user,"
                          "'read_only',current_setting('transaction_read_only'),'superuser',current_setting('is_superuser'));",
                          database, read_only=True)
        state = json.loads(result.stdout)
        require(state == {"database": database, "login_role": "postgres", "read_only": "on", "superuser": "off"},
                "Verified TLS test DB connection identity mismatch.")
        return state

    def archive(self, database="postgres", public_only=False):
        extra = ["-Fc", "--lock-wait-timeout=5s"] + (["--schema=public"] if public_only else [])
        result = subprocess.run(self.command("pg_dump", database, extra), input=self.payload,
                                capture_output=True, timeout=120)
        require(result.returncode == 0 and result.stdout.startswith(b"PGDMP"), "Test backup failed.")
        return result.stdout

    def snapshot(self, database="postgres"):
        schemas = "'public','auth','storage','supabase_migrations','legacy_multiclub','cutover_failed_public'"
        tables = json.loads(self.sql("SELECT coalesce(jsonb_agg(jsonb_build_array(schemaname,tablename) "
                                    "ORDER BY schemaname,tablename),'[]'::jsonb) FROM pg_tables WHERE schemaname IN ("
                                    + schemas + ");", database, read_only=True).stdout)
        pieces = ["SELECT " + literal(s + "." + t) + " k,coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]'::jsonb) v FROM "
                  + identifier(s) + "." + identifier(t) + " x" for s, t in tables]
        return json.loads(self.sql("SELECT coalesce(jsonb_object_agg(k,v),'{}'::jsonb) FROM (" +
                                   " UNION ALL ".join(pieces) + ") a;", database, read_only=True).stdout)


if __name__ == "__main__":
    # Running this module directly never installs a barrier or creates a DB.
    import sys
    try:
        require(len(sys.argv) == 1, "No direct execution arguments accepted.")
        connection = TestConnection()
        print(json.dumps({"project": TEST_REF, "state": connection.state(), "writes_enabled": False}))
    except Exception as error:
        print("Test connection inspection stopped: " + type(error).__name__)
        raise SystemExit(1)
