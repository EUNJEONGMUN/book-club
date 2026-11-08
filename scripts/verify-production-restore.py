#!/usr/bin/env python3
"""Verify the production archive entirely offline in a disposable local container.

No production connection, hosted API, password prompt, exposed port, or app DB reset.
Original archives/manifests are immutable. Reports contain no printed row values.
"""
import argparse
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
    args = parser.parse_args()
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
        tables = json.loads(sql("SELECT COALESCE(jsonb_agg(jsonb_build_object('schema',schemaname,'table',tablename)), '[]'::jsonb) FROM pg_catalog.pg_tables WHERE schemaname IN ('public','auth','storage','supabase_migrations','legacy_multiclub');", database).stdout)
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
        sql("CREATE DATABASE " + MIGRATION_DB + " WITH TEMPLATE " + BASE_DB + " OWNER supabase_admin;", "postgres", BOOTSTRAP_USER)
        migrations = []
        for version in ("20261108000002", "20261108000003", "20261108000004"):
            paths = list((ROOT / "supabase/migrations").glob(version + "_*.sql"))
            if len(paths) != 1:
                raise RuntimeError("Unexpected migration file set.")
            body = paths[0].read_bytes()
            migrations.append({"name": paths[0].name, "sha256": digest(body)})
            sql(body.decode(), MIGRATION_DB, "supabase_admin")
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
            require(canonical(before[name]) == canonical(after[name]), "entire table unchanged after conversion: " + name)
        require(canonical(project(before["public.club_members"], ["club_id"])) == canonical(after["public.members"]), "member IDs roles and join timestamps preserved")
        require(canonical(project(before["public.club_invites"], ["club_id"])) == canonical(after["public.invites"]), "invite IDs tokens creator and expiration preserved")
        old_club = before["public.clubs"][0]
        expected_settings = {**{k: v for k, v in old_club.items() if k != "id"}, "id": 1, "legacy_club_id": CLUB}
        require(after["public.club_settings"] == [expected_settings], "club settings preserve all original fields")
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
            "schema_rehearsal_role": "supabase_admin",
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
