#!/usr/bin/env python3
"""Verify the production archive entirely offline in a disposable local container.

No production connection, hosted API, password prompt, exposed port, or app DB reset.
Original archives/manifests are immutable. Reports contain no printed row values.
"""
import argparse
import importlib.util
from datetime import datetime, timezone
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tarfile
import time

ROOT = Path(__file__).resolve().parents[1]
BACKUPS = ROOT / ".local-backups"
LOCAL_CONTAINER = "supabase_db_book-club"
PROJECT = "chvprcpdfgivnfkgwkem"
CLUB = "7504fd29-94ee-4134-b4f6-d7adb25fb2ac"
BASE_DB = "production_restored"
MIGRATION_DB = "single_club_rehearsal"
BOOTSTRAP_USER = "supabase_admin"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def canonical(rows):
    return sorted(json.dumps(row, sort_keys=True, ensure_ascii=False) for row in rows)


def quote_identifier(value):
    return '"' + value.replace('"', '""') + '"'


def policy_properties(policies):
    result = []
    for row in policies:
        item = {k: row[k] for k in ("schemaname", "tablename", "policyname", "permissive", "cmd")}
        roles = row["roles"]
        # Management API serializes name[] as PostgreSQL array text; to_jsonb
        # serializes the same value as a JSON array. Reject unfamiliar encodings.
        if isinstance(roles, str):
            if not re.fullmatch(r"\{(?:[a-z_][a-z0-9_]*(?:,[a-z_][a-z0-9_]*)*)?\}", roles):
                raise RuntimeError("Unsupported role-array encoding in earlier metadata.")
            roles = roles[1:-1].split(",") if roles != "{}" else []
        if not isinstance(roles, list) or not all(isinstance(role, str) for role in roles):
            raise RuntimeError("Unexpected policy role list.")
        item["roles"] = sorted(roles)
        result.append(item)
    return result


def save(folder, name, data):
    encoded = data if isinstance(data, bytes) else json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True).encode()
    with (folder / name).open("xb") as stream:
        stream.write(encoded)
    return {"path": name, "bytes": len(encoded), "sha256": digest(encoded)}


def private_path(value):
    path = Path(value).resolve()
    if not path.is_relative_to(BACKUPS.resolve()):
        raise RuntimeError("Inputs must be inside the ignored local backup directory.")
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backup", required=True, help="Production dump directory under .local-backups")
    parser.add_argument("--records", required=True, help="Earlier read-only records/file copy directory")
    parser.add_argument("--postgres-rehearsal", action="store_true",
                        help="Rehearse as non-superuser postgres with the hosted Storage policy grant")
    parser.add_argument('--write-barrier-rehearsal', action='store_true',
                        help='Keep local-only write guards across old-schema conversion transactions')
    args = parser.parse_args()
    if args.write_barrier_rehearsal and not args.postgres_rehearsal:
        parser.error('--write-barrier-rehearsal requires --postgres-rehearsal')
    os.umask(0o077)
    backup = private_path(args.backup)
    copied = private_path(args.records)
    if subprocess.run(["git", "check-ignore", "-q", str(backup / "database.dump")], cwd=ROOT).returncode:
        raise RuntimeError("Backup files must be excluded from Git.")
    manifest = json.loads((backup / "manifest.json").read_text())
    archive = (backup / "database.dump").read_bytes()
    if manifest.get("project_ref") != PROJECT or manifest.get("probe_club_id") != CLUB:
        raise RuntimeError("Unexpected production archive identity.")
    if len(archive) != manifest["bytes"] or digest(archive) != manifest["sha256"]:
        raise RuntimeError("Production archive size/hash mismatch.")
    copy_manifest = json.loads((copied / "manifest.json").read_text())
    if copy_manifest.get("project_ref") != PROJECT or copy_manifest.get("club_id") != CLUB:
        raise RuntimeError("Unexpected record/file copy identity.")
    for item in copy_manifest["artifacts"]:
        path = (copied / item["path"]).resolve()
        if not path.is_relative_to(copied):
            raise RuntimeError("Invalid copied artifact path.")
        data = path.read_bytes()
        if len(data) != item["bytes"] or digest(data) != item["sha256"]:
            raise RuntimeError("Record/file copy checksum mismatch.")
    folder = BACKUPS / ("production-restore-verified-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ"))
    folder.mkdir(mode=0o700)
    checks = []
    container_name = "book-club-production-verify-" + str(time.time_ns())
    container_id = None
    local_snapshot = folder / "existing-local-records.json"

    def require(condition, label):
        if not condition:
            raise RuntimeError("Verification failed: " + label)
        checks.append(label)

    def run(command, stage, data=None, check=True):
        result = subprocess.run(command, input=data, capture_output=True)
        if result.stderr:
            save(folder, f"{len(list(folder.iterdir())):03d}-{stage}.log", result.stderr)
        if check and result.returncode:
            raise RuntimeError(stage + " failed; private diagnostic log saved in " + str(folder))
        return result

    def inside(arguments, stage, data=None, check=True):
        if not container_id:
            raise RuntimeError("Isolated verification container is unavailable.")
        return run(["docker", "exec", "-i", "-e", "PGOPTIONS=", container_id, *arguments], stage, data, check)

    def sql(statement, database=BASE_DB, role="supabase_admin", check=True):
        if database not in ("postgres", BASE_DB, MIGRATION_DB):
            raise RuntimeError("Unexpected verification database.")
        return inside(["psql", "-h", "/tmp", "-U", role, "-d", database, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"],
                      "sql", statement.encode(), check)

    def snapshot(database):
        tables = json.loads(sql("SELECT COALESCE(jsonb_agg(jsonb_build_object('schema',schemaname,'table',tablename)), '[]'::jsonb) FROM pg_catalog.pg_tables WHERE schemaname IN ('public','auth','storage','supabase_migrations','legacy_multiclub','cutover_failed_public');", database).stdout)
        parts = []
        for table in tables:
            name = table["schema"] + "." + table["table"]
            qualified = quote_identifier(table["schema"]) + "." + quote_identifier(table["table"])
            parts.append("SELECT '" + name.replace("'", "''") + "' AS name, COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) AS rows FROM " + qualified + " t")
        return json.loads(sql("BEGIN READ ONLY; SELECT jsonb_object_agg(name, rows) FROM (" + " UNION ALL ".join(parts) + ") all_tables; ROLLBACK;", database).stdout)

    try:
        run(["node", "scripts/check-local-records.mjs", "snapshot", str(local_snapshot)], "existing-local-before")
        image = run(["docker", "inspect", "--format", "{{.Config.Image}}", LOCAL_CONTAINER], "image").stdout.decode().strip()
        if not image.startswith("public.ecr.aws/supabase/postgres:17."):
            raise RuntimeError("Expected the already installed local Supabase PostgreSQL 17 image.")
        # Cluster roles aren't in pg_dump. Borrow password-free LOCAL role definitions
        # only to satisfy owner/ACL references in this completely isolated rehearsal.
        roles = run(["docker", "exec", LOCAL_CONTAINER, "pg_dumpall", "-U", "supabase_admin", "--roles-only", "--no-role-passwords"], "local-role-definitions").stdout
        require(not re.search(rb"\bPASSWORD\s+'", roles, re.I), "bootstrap roles contain no password hashes")
        save(folder, "local-bootstrap-roles.sql", roles)
        # PostgreSQL 17 validates GRANTED BY against the creating grantor's ADMIN
        # option. Bootstrap with the same local grantor, not a different superuser.
        bootstrap_roles = roles.replace(b"CREATE ROLE supabase_admin;\n", b"")
        init = ("(initdb -D /tmp/restore-data -U supabase_admin --auth=trust --encoding=UTF8 --locale=C >/tmp/initdb.log 2>&1 || "
                "{ cat /tmp/initdb.log; exit 1; }) && "
                "exec postgres -D /tmp/restore-data -c listen_addresses= -c unix_socket_directories=/tmp -c shared_preload_libraries=")
        if args.postgres_rehearsal:
            # This offline clone gets only the policy grant required by migration 03.
            # The hosted catalog was inspected read-only; never change managed owners.
            init += (" -c session_preload_libraries=supautils"
                     " -c supautils.superuser=supabase_admin"
                     " -c supautils.privileged_role=supabase_privileged_role"
                     " -c 'supautils.policy_grants={\"postgres\":[\"storage.objects\"]}'")
        started = run(["docker", "run", "--detach", "--pull", "never", "--network", "none", "--name", container_name,
                       "--label", "book-club.restore-verification=true", "--user", "postgres",
                       "--tmpfs", "/tmp:rw,mode=1777,size=536870912", "--entrypoint", "/bin/sh", image, "-c", init], "start-container")
        container_id = started.stdout.decode().strip()
        if not re.fullmatch(r"[a-f0-9]{64}", container_id):
            raise RuntimeError("Unexpected container identity.")
        for _ in range(100):
            ready = inside(["pg_isready", "-h", "/tmp", "-U", BOOTSTRAP_USER, "-d", "postgres"], "ready", check=False)
            if ready.returncode == 0:
                break
            time.sleep(0.2)
        else:
            logs = run(["docker", "logs", container_id], "container-diagnostics", check=False)
            save(folder, "container-start.log", logs.stdout + logs.stderr)
            raise RuntimeError("Isolated PostgreSQL startup failed; diagnostic log saved.")
        network = run(["docker", "inspect", "--format", "{{.HostConfig.NetworkMode}}", container_id], "check-network").stdout.strip()
        require(network == b"none", "verification container has no external network")
        sql(bootstrap_roles.decode(), "postgres", BOOTSTRAP_USER)
        sql("CREATE DATABASE " + BASE_DB + " OWNER supabase_admin;", "postgres", BOOTSTRAP_USER)
        print("Offline container ready. Restoring the complete production archive.", flush=True)
        inside(["pg_restore", "-h", "/tmp", "-U", "supabase_admin", "--exit-on-error", "--dbname", BASE_DB], "restore-production", archive)
        require(True, "complete archive restored without ignoring errors")
        listing = inside(["pg_restore", "--list"], "list-archive", archive).stdout.decode()
        if re.search(r";.*\b(BLOB|BLOBS|SUBSCRIPTION)\b", listing):
            raise RuntimeError("Archive contains large objects/subscriptions requiring additional verification.")
        data_sql = inside(["pg_restore", "--data-only", "--no-owner", "--no-acl", "--file", "-"], "extract-archive-data", archive).stdout
        lines = data_sql.splitlines()
        block_count = 0
        sequence_count = 0
        index = 0
        while index < len(lines):
            line = lines[index]
            match = re.fullmatch(rb"COPY (.+) \((.+)\) FROM stdin;", line)
            if match:
                expected = []
                index += 1
                while index < len(lines) and lines[index] != b"\\.":
                    expected.append(lines[index])
                    index += 1
                require(index < len(lines), "complete COPY block " + str(block_count + 1))
                table = match[1].decode()
                columns = match[2].decode()
                actual = sql("BEGIN READ ONLY; SET LOCAL DateStyle=ISO; SET LOCAL IntervalStyle=postgres; SET LOCAL extra_float_digits=3; SET LOCAL TIME ZONE 'UTC'; COPY " + table + " (" + columns + ") TO STDOUT; ROLLBACK;").stdout.splitlines()
                require(sorted(expected) == sorted(actual), "archive COPY records exactly restored: " + table)
                block_count += 1
            else:
                sequence = re.fullmatch(rb"SELECT pg_catalog.setval\('((?:[^']|'')*)', (-?\d+), (true|false)\);", line)
                if sequence:
                    name = sequence[1].decode().replace("''", "'")
                    actual = json.loads(sql("SELECT jsonb_build_array(last_value,is_called) FROM " + name + ";").stdout)
                    require(actual == [int(sequence[2]), sequence[3] == b"true"], "sequence position restored: " + name)
                    sequence_count += 1
            index += 1
        table_entries = sum(" TABLE DATA " in line for line in listing.splitlines())
        sequence_entries = sum(" SEQUENCE SET " in line for line in listing.splitlines())
        require(block_count == table_entries and block_count > 0, "every archive table data block verified")
        require(sequence_count == sequence_entries, "every archive sequence position verified")
        before = snapshot(BASE_DB)
        save(folder, "restored-records.json", before)
        require(len(before.get("public.clubs", [])) == 1 and before["public.clubs"][0]["id"] == CLUB, "verified production club restored")
        earlier = json.loads((copied / "records.json").read_text())
        for name in sorted(k for k in earlier if k.startswith("public.") or k.startswith("storage.")):
            require(canonical(earlier[name]) == canonical(before[name]), "matches earlier read-only copy: " + name)
        for name, keys in {
            "auth.users": ["id", "email", "encrypted_password", "role", "aud", "email_confirmed_at", "created_at"],
            "auth.identities": ["id", "user_id", "provider_id", "provider", "identity_data", "created_at"],
        }.items():
            project = lambda rs: [{key: row.get(key) for key in keys} for row in rs]
            require(canonical(project(earlier[name])) == canonical(project(before[name])), "account identity/credentials match earlier copy: " + name)
        metadata = json.loads((copied / "metadata.json").read_text())
        policies = json.loads(sql("SELECT COALESCE(jsonb_agg(to_jsonb(p)), '[]'::jsonb) FROM pg_catalog.pg_policies p WHERE schemaname IN ('public','storage');").stdout)
        save(folder, "restored-policies.json", policies)
        require(canonical(policy_properties(policies)) == canonical(policy_properties(metadata["policies"])), "original public/storage policy identities and role/command properties restored")
        # pg_policies.qual deparses names using the querying session's search_path.
        # Compare predicates through pg_dump on both sides, which fixes search_path.
        source_schema = inside(["pg_restore", "--schema-only", "--no-owner", "--no-acl", "--file", "-"], "extract-original-schema", archive).stdout
        restored_schema = inside(["pg_dump", "-h", "/tmp", "-U", "supabase_admin", "--dbname", BASE_DB, "--schema-only", "--no-owner", "--no-acl", "--lock-wait-timeout=5s"], "dump-restored-schema").stdout
        policy_statements = lambda data: sorted(re.findall(rb"(?ms)^CREATE POLICY .*?;\n", data))
        rls_flags = lambda data: sorted(re.findall(rb"(?m)^ALTER TABLE (?:ONLY )?.+ (?:ENABLE|FORCE) ROW LEVEL SECURITY;$", data))
        source_policies, restored_policies = policy_statements(source_schema), policy_statements(restored_schema)
        save(folder, "archive-policy-definitions.sql", b"".join(source_policies))
        save(folder, "restored-policy-definitions.sql", b"".join(restored_policies))
        require(bool(source_policies) and source_policies == restored_policies, "every archived RLS predicate/definition exactly restored")
        require(rls_flags(source_schema) == rls_flags(restored_schema), "every archived RLS enable/force flag restored")

        files = json.loads((copied / "storage-manifest.json").read_text())
        objects = {row["id"]: row for row in before["storage.objects"]}
        require(len(files) == len(objects), "all stored objects have a file backup")
        tar_bytes = io.BytesIO()
        with tarfile.open(fileobj=tar_bytes, mode="w") as tar:
            for item in files:
                obj = objects[item["id"]]
                require(obj["name"] == item["name"] and obj["bucket_id"] == item["bucket_id"], "file object ID/path matches restored metadata " + item["id"])
                name = PurePosixPath(item["bucket_id"]) / item["name"]
                if name.is_absolute() or ".." in name.parts:
                    raise RuntimeError("Unsafe storage object path.")
                data = (copied / item["path"]).read_bytes()
                require(digest(data) == item["sha256"] and len(data) == item["bytes"], "file backup checksum verified " + item["id"])
                info = tarfile.TarInfo(str(name))
                info.size = len(data)
                info.mode = 0o600
                tar.addfile(info, io.BytesIO(data))
        inside(["mkdir", "-m", "700", "/tmp/restored-storage"], "storage-directory")
        inside(["tar", "-xf", "-", "-C", "/tmp/restored-storage"], "restore-file-bytes", tar_bytes.getvalue())
        for item in files:
            path = "/tmp/restored-storage/" + str(PurePosixPath(item["bucket_id"]) / item["name"])
            actual = inside(["sha256sum", "--", path], "restored-file-checksum").stdout.split()[0].decode()
            require(actual == item["sha256"], "restored file bytes match " + item["id"])
        print("Archive records, accounts, policies, sequences and all file bytes match. Rehearsing conversion on a second copy.", flush=True)
        migration_role = "postgres" if args.postgres_rehearsal else "supabase_admin"
        sql("CREATE DATABASE " + MIGRATION_DB + " WITH TEMPLATE " + BASE_DB + " OWNER " + migration_role + ";", "postgres", BOOTSTRAP_USER)
        if args.postgres_rehearsal:
            role_state = json.loads(sql("SELECT jsonb_build_object('user',current_user,'superuser',current_setting('is_superuser'),'database_create',has_database_privilege(current_database(),'CREATE'),'storage_owner',pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='storage.objects'::regclass)),'owns_storage',pg_has_role((SELECT relowner FROM pg_class WHERE oid='storage.objects'::regclass),'USAGE'),'policy_grants',current_setting('supautils.policy_grants')::jsonb);", MIGRATION_DB, migration_role).stdout)
            require(role_state == {"user": "postgres", "superuser": "off", "database_create": True,
                                   "storage_owner": "supabase_storage_admin", "owns_storage": False,
                                   "policy_grants": {"postgres": ["storage.objects"]}},
                    "non-superuser postgres uses managed Storage policy grant without ownership")
            require(all(row["owner"] == "postgres" for row in json.loads(sql("SELECT jsonb_agg(jsonb_build_object('owner',tableowner)) FROM pg_tables WHERE schemaname='public';", MIGRATION_DB).stdout)),
                    "application table owners match hosted postgres role")
        guard = None
        if args.write_barrier_rehearsal:
            spec = importlib.util.spec_from_file_location('write_guard', ROOT / 'scripts/write-barrier-sql.py')
            guard = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(guard)
            sql(guard.install(MIGRATION_DB), MIGRATION_DB, migration_role)
            require(True, 'temporary statement guards installed on the old production schema as postgres')
            frozen_public = inside(['pg_dump', '-h', '/tmp', '-U', migration_role, '-d', MIGRATION_DB,
                                    '--schema=public', '-Fc', '--lock-wait-timeout=5s'], 'frozen-public-backup').stdout
            save(folder, 'frozen-public-before-conversion.dump', frozen_public)
            public_defaults = sql("SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY oid),'[]'::jsonb) FROM pg_default_acl d WHERE defaclnamespace='public'::regnamespace;", MIGRATION_DB, migration_role).stdout
            original_publications = json.loads(sql("SELECT coalesce(jsonb_agg(jsonb_build_object('publication',pubname,'table',tablename)),'[]'::jsonb) FROM pg_publication_tables WHERE schemaname='public';", MIGRATION_DB, migration_role).stdout)
            require(sql("SELECT count(*) FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace tn ON tn.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname='public' AND tn.nspname NOT IN ('public');", MIGRATION_DB, migration_role).stdout.strip() == b'0',
                    'no managed-table trigger depends on a public function that would need additional rebinding during rollback')
            probe = sql("SET ROLE authenticated; UPDATE public.profiles SET display_name=display_name WHERE false;", MIGRATION_DB, 'authenticator', check=False)
            require(probe.returncode != 0 and b'Temporary write barrier active' in probe.stderr,
                    'old-schema direct API login is refused before conversion')
        migrations = []
        for version in ("20261108000002", "20261108000003", "20261108000004"):
            paths = list((ROOT / "supabase/migrations").glob(version + "_*.sql"))
            if len(paths) != 1:
                raise RuntimeError("Unexpected migration file set.")
            body = paths[0].read_bytes()
            migrations.append({"name": paths[0].name, "sha256": digest(body)})
            candidate = guard.guard_migration(body.decode(), MIGRATION_DB) if guard else body.decode()
            if guard:
                quote = lambda value: "'" + value.replace("'", "''") + "'"
                ledger = ("INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES("
                          + quote(version) + ',' + quote(paths[0].stem.split('_', 1)[1])
                          + ',ARRAY[' + quote(body.decode()) + ']::text[]);\n')
                marker = candidate.rindex('COMMIT;')
                candidate = candidate[:marker] + ledger + candidate[marker:]
            sql(candidate, MIGRATION_DB, migration_role)
            if guard:
                missing = json.loads(sql("SELECT count(*) AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','storage','legacy_multiclub') AND c.relkind IN ('r','p') AND has_table_privilege('postgres',c.oid,'TRIGGER') AND NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=c.oid AND t.tgname='cutover_write_barrier' AND t.tgfoid='cutover_guard.reject_writes()'::regprocedure);", MIGRATION_DB, migration_role).stdout)
                require(missing == 0, 'new and archived tables guarded before commit: ' + version)
        after = snapshot(MIGRATION_DB)
        save(folder, "converted-records.json", after)
        project = lambda rs, omit: [{k: v for k, v in row.items() if k not in omit} for row in rs]
        for name in ("clubs", "club_members", "club_invites"):
            require(canonical(before["public." + name]) == canonical(after["legacy_multiclub." + name]), "complete original table archived: " + name)
        for name, omitted in (("profiles", ["is_admin"]), ("meetings", ["club_id"])):
            require(canonical(project(before["public." + name], omitted)) == canonical(after["public." + name]), "original live record preserved: " + name)
            require(canonical(before["public." + name]) == canonical(after["legacy_multiclub." + name + "_before_single_club"]), "original complete record archived: " + name)
        for name in ("public.discussion_questions", "public.attendances", "public.meeting_reviews"):
            require(canonical(before[name]) == canonical(after[name]), "activity record fully preserved: " + name)
        for name in sorted(k for k in before if k.startswith(("auth.", "storage.", "supabase_migrations."))):
            if guard and name == 'supabase_migrations.schema_migrations':
                originals = {row['version'] for row in before[name]}
                retained = [row for row in after[name] if row['version'] in originals]
                added = [row for row in after[name] if row['version'] not in originals]
                require(canonical(retained) == canonical(before[name]) and {row['version'] for row in added} == {'20261108000002','20261108000003','20261108000004'} and len(added) == 3,
                        'original migration history preserved and exactly three applied versions registered atomically')
            else:
                require(canonical(before[name]) == canonical(after[name]), "entire table unchanged after conversion: " + name)
        require(canonical(project(before["public.club_members"], ["club_id"])) == canonical(after["public.members"]), "member IDs roles and join timestamps preserved")
        require(canonical(project(before["public.club_invites"], ["club_id"])) == canonical(after["public.invites"]), "invite IDs tokens creator and expiration preserved")
        old_club = before["public.clubs"][0]
        expected_settings = {**{k: v for k, v in old_club.items() if k != "id"}, "id": 1, "legacy_club_id": CLUB}
        require(after["public.club_settings"] == [expected_settings], "club settings preserve all original fields")
        if guard:
            probe = sql("SET ROLE service_role; UPDATE public.profiles SET display_name=display_name WHERE false;", MIGRATION_DB, 'authenticator', check=False)
            require(probe.returncode != 0 and b'Temporary write barrier active' in probe.stderr,
                    'privileged direct API login remains refused after conversion')
            # Recover only the application schema. Keep failed/new data quarantined;
            # Auth rows and physical Storage bytes never need to be overwritten.
            public_toc = inside(['pg_restore', '--list'], 'frozen-public-toc', frozen_public).stdout
            public_toc_without_defaults = b'\n'.join(line for line in public_toc.splitlines() if b' DEFAULT ACL ' not in line) + b'\n'
            inside(['sh', '-c', 'cat > /tmp/frozen-public.dump'], 'copy-local-public-dump', frozen_public)
            inside(['sh', '-c', 'cat > /tmp/public-restore.list'], 'copy-local-public-list', public_toc_without_defaults)
            public_sql = inside(['pg_restore', '--schema=public', '--no-owner', '--use-list=/tmp/public-restore.list', '--file', '-', '/tmp/frozen-public.dump'],
                                'extract-frozen-public-backup').stdout.decode()
            recovery = 'BEGIN; SET LOCAL lock_timeout=\'5s\';\n' + guard.local_assertion(MIGRATION_DB)
            # Preserve the public schema OID and its managed default privileges.
            # Move only the app objects; no old/new rows are dropped or overwritten.
            recovery += """
CREATE SCHEMA cutover_failed_public;
REVOKE ALL ON SCHEMA cutover_failed_public FROM PUBLIC,anon,authenticated,service_role;
DO $move$
DECLARE o record;
BEGIN
 FOR o IN SELECT c.relname FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p') ORDER BY c.relname
 LOOP EXECUTE format('ALTER TABLE public.%I SET SCHEMA cutover_failed_public',o.relname); END LOOP;
 FOR o IN SELECT p.oid::regprocedure AS signature FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prokind='f'
 LOOP EXECUTE format('ALTER FUNCTION %s SET SCHEMA cutover_failed_public',o.signature); END LOOP;
 FOR o IN SELECT typname FROM pg_type WHERE typnamespace='public'::regnamespace AND typtype IN ('e','d')
 LOOP EXECUTE format('ALTER TYPE public.%I SET SCHEMA cutover_failed_public',o.typname); END LOOP;
 FOR o IN SELECT relname FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='S'
 LOOP EXECUTE format('ALTER SEQUENCE public.%I SET SCHEMA cutover_failed_public',o.relname); END LOOP;
END $move$;
"""
            for item in original_publications:
                recovery += 'ALTER PUBLICATION ' + quote_identifier(item['publication']) + ' DROP TABLE cutover_failed_public.' + quote_identifier(item['table']) + ';\n'
            if re.search(r'^CREATE SCHEMA public;', public_sql, re.M):
                raise RuntimeError('Unexpected public schema CREATE in scoped backup; inspect before recovery.')
            recovery += public_sql + '\n'
            current_storage_policies = json.loads(sql("SELECT coalesce(jsonb_agg(policyname),'[]'::jsonb) FROM pg_policies WHERE schemaname='storage' AND tablename='objects';", MIGRATION_DB, migration_role).stdout)
            for name in current_storage_policies:
                recovery += 'DROP POLICY ' + quote_identifier(name) + ' ON storage.objects;\n'
            recovery += b''.join(p for p in source_policies if b' ON storage.objects ' in p).decode()
            recovery += "CREATE TABLE cutover_failed_public.migration_history AS TABLE supabase_migrations.schema_migrations; DELETE FROM supabase_migrations.schema_migrations WHERE version IN ('20261108000002','20261108000003','20261108000004');\n"
            recovery += guard.attach(MIGRATION_DB) + "NOTIFY pgrst,'reload schema';\nCOMMIT;\n"
            save(folder, 'local-application-rollback.sql', recovery.encode())
            sql(recovery, MIGRATION_DB, migration_role)
            rolled = snapshot(MIGRATION_DB)
            save(folder, 'rollback-records.json', rolled)
            for name, rows in before.items():
                require(canonical(rows) == canonical(rolled[name]), 'rollback restores original live rows without overwriting Auth/Storage: ' + name)
            for name, rows in after.items():
                if name.startswith('public.'):
                    require(canonical(rows) == canonical(rolled[name.replace('public.', 'cutover_failed_public.', 1)]),
                            'failed/new application data is preserved in private quarantine: ' + name)
            require(canonical(rolled['cutover_failed_public.migration_history']) == canonical(after['supabase_migrations.schema_migrations']),
                    'failed conversion migration history preserved while live ledger returns to its original versions')
            require(sql("SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY oid),'[]'::jsonb) FROM pg_default_acl d WHERE defaclnamespace='public'::regnamespace;", MIGRATION_DB, migration_role).stdout == public_defaults,
                    'public schema and managed default privileges remain intact without requiring a privileged role')
            rollback_publications = json.loads(sql("SELECT coalesce(jsonb_agg(jsonb_build_object('publication',pubname,'table',tablename)),'[]'::jsonb) FROM pg_publication_tables WHERE schemaname='public';", MIGRATION_DB, migration_role).stdout)
            require(canonical(rollback_publications) == canonical(original_publications),
                    'original live Realtime publication membership is restored')
            rolled_policies = inside(['pg_dump', '-h', '/tmp', '-U', migration_role, '-d', MIGRATION_DB,
                                      '--schema-only', '--no-owner', '--no-acl'], 'rollback-policy-dump').stdout
            live_policy = lambda definitions: sorted(p for p in policy_statements(definitions) if b' ON public.' in p or b' ON storage.objects ' in p)
            require(live_policy(source_schema) == live_policy(rolled_policies), 'original live application and Storage RLS predicates restored during rollback')
            require(sql("SELECT has_schema_privilege('anon','cutover_failed_public','USAGE') OR has_schema_privilege('authenticated','cutover_failed_public','USAGE') OR has_schema_privilege('service_role','cutover_failed_public','USAGE');", MIGRATION_DB, migration_role).stdout.strip() == b'f',
                    'failed conversion data remains in a private quarantine schema')
            require(sql("SELECT count(*) FROM public.clubs;", MIGRATION_DB, migration_role).stdout.strip() == b'1',
                    'original multi-club-compatible application schema is available again before writes resume')
            sql(guard.remove(MIGRATION_DB), MIGRATION_DB, migration_role)
            require(sql("SELECT to_regnamespace('cutover_guard') IS NULL;", MIGRATION_DB, migration_role).stdout.strip() == b't',
                    'temporary guards removed without dropping original application or managed triggers')
        baseline_after = snapshot(BASE_DB)
        require(set(baseline_after) == set(before) and all(canonical(baseline_after[k]) == canonical(before[k]) for k in before), "baseline restored database unchanged by rehearsal")
        report = {
            "passed": True, "completed_at": datetime.now(timezone.utc).isoformat(),
            "archive_sha256": digest(archive), "source_backup": str(backup.relative_to(ROOT)),
            "database_image": image,
            "earlier_copy": str(copied.relative_to(ROOT)), "network_mode": "none",
            "existing_local_database_modified": False, "production_connection_used": False,
            "restored_copy_blocks": block_count, "sequence_positions_verified": sequence_count,
            "restored_files_verified": len(files), "public_counts": {k: len(v) for k, v in before.items() if k.startswith("public.")},
            "auth_users": len(before["auth.users"]), "auth_identities": len(before["auth.identities"]),
            "migrations": migrations, "checks": checks,
            "schema_rehearsal_role": migration_role,
            "write_barrier_rehearsal": args.write_barrier_rehearsal,
            "application_schema_rollback_rehearsal": args.write_barrier_rehearsal,
            "limitations": ["cluster roles bootstrapped from password-free local role definitions, not a production roles backup",
                            "online DB and file copies were taken at different times; final write-frozen backup is still required",
                            "file bytes restored offline; Auth service/OAuth providers and Storage HTTP API were not started"],
        }
    except Exception as error:
        save(folder, "verification-failure.json", {"passed": False, "error": str(error) if isinstance(error, RuntimeError) else type(error).__name__, "checks_completed": checks})
        raise
    finally:
        if container_id and re.fullmatch(r"[a-f0-9]{64}", container_id):
            label = run(["docker", "inspect", "--format", '{{index .Config.Labels "book-club.restore-verification"}}', container_id], "cleanup-identity", check=False)
            if label.returncode == 0 and label.stdout.strip() == b"true":
                run(["docker", "rm", "--force", "--volumes", container_id], "cleanup-container")
        if local_snapshot.is_file():
            run(["node", "scripts/check-local-records.mjs", "compare", str(local_snapshot)], "existing-local-after")
            require(True, "existing local application records unchanged")
        require(digest((backup / "database.dump").read_bytes()) == manifest["sha256"], "original backup archive unchanged")
    save(folder, "verification-report.json", report)
    print(json.dumps({"passed": True, "checks": len(checks), "copy_blocks": block_count, "files": len(files), "report": str(folder / "verification-report.json")}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, RuntimeError) else type(error).__name__)
        raise SystemExit(1)
