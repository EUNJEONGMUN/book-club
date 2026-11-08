#!/usr/bin/env python3
"""Run real local Auth/REST/Storage/browser checks on a separate production restore."""
import base64
from datetime import datetime, timezone
import hashlib
import hmac
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import secrets
import shutil
import socket
import subprocess
import tarfile
import time

ROOT = Path(__file__).resolve().parents[1]
BACKUP = ROOT / ".local-backups/production-dump-20261108T052113760121Z"
FILES = ROOT / ".local-backups/production-readonly-20261108T045110487853Z"
LOCAL_DB = "supabase_db_book-club"
DATABASE = "runtime_verified"
CLUB = "7504fd29-94ee-4134-b4f6-d7adb25fb2ac"


def canonical(rows):
    return sorted(json.dumps(row, sort_keys=True, ensure_ascii=False) for row in rows)


def storage_migrations_match(before, after):
    # The local Storage service recalculates SQL-file checksums on startup.
    # IDs, migration names/timestamps and every other field must remain exact.
    strip_hash = lambda rows: [{k:v for k,v in row.items() if k != "hash"} for row in rows]
    return (all(isinstance(row.get("hash"), str) and re.fullmatch(r"[a-f0-9]{40}", row["hash"]) for row in before + after)
            and canonical(strip_hash(before)) == canonical(strip_hash(after)))


def main():
    os.umask(0o077)
    folder = ROOT / ".local-backups" / ("local-service-flow-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ"))
    folder.mkdir(mode=0o700)
    label = "book-club.service-verification"
    prefix = "book-club-services-" + str(time.time_ns())
    containers = []
    network = None
    db = None
    app_dir = None
    passed = []
    local_snapshot = folder / "existing-local-records.json"
    archive = (BACKUP / "database.dump").read_bytes()
    original_manifest = (BACKUP / "manifest.json").read_bytes()
    manifest = json.loads(original_manifest)
    if hashlib.sha256(archive).hexdigest() != manifest["sha256"] or manifest["probe_club_id"] != CLUB:
        raise RuntimeError("Backup identity/hash mismatch.")

    def run(args, stage, data=None, check=True):
        result = subprocess.run(args, input=data, capture_output=True)
        if result.stderr:
            (folder / (str(len(list(folder.iterdir()))) + "-" + stage + ".log")).write_bytes(result.stderr)
        if check and result.returncode:
            raise RuntimeError(stage + " failed; private logs: " + str(folder))
        return result

    def inspect(name):
        return json.loads(run(["docker", "inspect", name], "inspect").stdout)[0]

    def sql(text, database=DATABASE):
        if database not in (DATABASE, "postgres"):
            raise RuntimeError("Unexpected local database.")
        return run(["docker", "exec", "-i", db, "psql", "-h", "/tmp", "-U", "supabase_admin", "-d", database,
                    "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], "sql", text.encode()).stdout

    def snapshot():
        names = json.loads(sql("SELECT jsonb_agg(jsonb_build_array(schemaname,tablename)) FROM pg_catalog.pg_tables WHERE schemaname IN ('public','auth','storage','legacy_multiclub','supabase_migrations');"))
        parts = []
        for schema, table in names:
            if not re.fullmatch(r"[a-z_][a-z0-9_]*", schema + "_" + table):
                raise RuntimeError("Unexpected table identifier.")
            parts.append(f"SELECT '{schema}.{table}' AS name, COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) AS rows FROM {schema}.{table} t")
        return json.loads(sql("BEGIN READ ONLY; SELECT jsonb_object_agg(name, rows) FROM (" + " UNION ALL ".join(parts) + ") t; ROLLBACK;"))

    def require(ok, name):
        if not ok:
            raise RuntimeError("Verification failed: " + name)
        passed.append(name)

    def start(kind, image, env=None, extra=None, entry=None, command=None):
        args = ["docker", "run", "-d", "--pull", "never", "--name", prefix + "-" + kind,
                "--label", label + "=true", "--network", network, "--network-alias", kind]
        if env:
            env_file = folder / (kind + ".env")
            env_file.write_text("\n".join(k + "=" + str(v) for k, v in env.items()) + "\n")
            args += ["--env-file", str(env_file)]
        args += extra or []
        if entry:
            args += ["--entrypoint", entry]
        args += [image, *(command or [])]
        cid = run(args, "start-" + kind).stdout.decode().strip()
        if not re.fullmatch(r"[a-f0-9]{64}", cid):
            raise RuntimeError("Unexpected container identity.")
        containers.append(cid)
        return cid

    def unused_port():
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            return sock.getsockname()[1]

    try:
        run(["node", "scripts/check-local-records.mjs", "snapshot", str(local_snapshot)], "local-before")
        images = {k: inspect(v)["Config"]["Image"] for k, v in {
            "db": LOCAL_DB, "auth": "supabase_auth_book-club", "rest": "supabase_rest_book-club", "storage": "supabase_storage_book-club"}.items()}
        roles = run(["docker", "exec", LOCAL_DB, "pg_dumpall", "-U", "supabase_admin", "--roles-only", "--no-role-passwords"], "bootstrap-roles").stdout
        require(not re.search(rb"\bPASSWORD\s+'", roles, re.I), "bootstrap roles contain no existing passwords")
        network = run(["docker", "network", "create", "--internal", "--label", label + "=true", prefix], "create-internal-network").stdout.decode().strip()
        init = "initdb -D /tmp/runtime-db -U supabase_admin --auth=trust --encoding=UTF8 --locale=C >/tmp/initdb.log 2>&1 || { cat /tmp/initdb.log; exit 1; }; printf '\\nhost runtime_verified all 0.0.0.0/0 trust\\n' >> /tmp/runtime-db/pg_hba.conf; exec postgres -D /tmp/runtime-db -c listen_addresses=* -c unix_socket_directories=/tmp -c shared_preload_libraries="
        db = start("db", images["db"], extra=["--user", "postgres", "--tmpfs", "/tmp:rw,mode=1777,size=536870912"], entry="sh", command=["-c", init])
        for _ in range(100):
            r = run(["docker", "exec", db, "pg_isready", "-h", "/tmp", "-U", "supabase_admin", "-d", "postgres"], "db-ready", check=False)
            if not r.returncode:
                break
            time.sleep(0.2)
        else:
            raise RuntimeError("Local verification DB did not start.")
        sql(roles.replace(b"CREATE ROLE supabase_admin;\n", b"").decode(), "postgres")
        sql("CREATE DATABASE " + DATABASE + " OWNER supabase_admin;", "postgres")
        run(["docker", "exec", "-i", db, "pg_restore", "-h", "/tmp", "-U", "supabase_admin", "--exit-on-error", "--dbname", DATABASE], "restore", archive)
        for version in ("20261108000002", "20261108000003", "20261108000004"):
            path = next((ROOT / "supabase/migrations").glob(version + "_*.sql"))
            sql(path.read_text())
        baseline = snapshot()
        (folder / "restored-baseline.json").write_text(json.dumps(baseline, ensure_ascii=False))
        print("Separate local DB restored and converted. Starting real Auth/REST/Storage services.", flush=True)

        secret = secrets.token_hex(32)
        def jwt(role):
            encode = lambda x: base64.urlsafe_b64encode(json.dumps(x, separators=(",", ":")).encode()).rstrip(b"=")
            body = encode({"alg": "HS256", "typ": "JWT"}) + b"." + encode({"iss": "supabase", "role": role, "iat": int(time.time()), "exp": int(time.time()) + 14400})
            return (body + b"." + base64.urlsafe_b64encode(hmac.new(secret.encode(), body, hashlib.sha256).digest()).rstrip(b"=")).decode()
        anon, service = jwt("anon"), jwt("service_role")
        api_port, app_port = unused_port(), unused_port()
        while app_port == api_port:
            app_port = unused_port()
        api = f"http://127.0.0.1:{api_port}"
        app = f"http://127.0.0.1:{app_port}"
        auth = start("auth", images["auth"], {
            "GOTRUE_API_HOST": "0.0.0.0", "GOTRUE_API_PORT": "9999", "API_EXTERNAL_URL": api + "/auth/v1",
            "GOTRUE_DB_DRIVER": "postgres", "GOTRUE_DB_DATABASE_URL": "postgresql://supabase_auth_admin@db:5432/" + DATABASE + "?sslmode=disable",
            "GOTRUE_DB_MIGRATIONS_PATH": "/usr/local/etc/auth/migrations", "GOTRUE_DB_CLEANUP_ENABLED": "false", "GOTRUE_DB_ADVISOR_ENABLED": "false",
            "GOTRUE_SITE_URL": app, "GOTRUE_URI_ALLOW_LIST": app + "/**", "GOTRUE_JWT_SECRET": secret,
            "GOTRUE_JWT_AUD": "authenticated", "GOTRUE_JWT_DEFAULT_GROUP_NAME": "authenticated", "GOTRUE_JWT_ADMIN_ROLES": "service_role",
            "GOTRUE_JWT_ISSUER": api + "/auth/v1", "GOTRUE_JWT_EXP": "3600", "GOTRUE_MAILER_AUTOCONFIRM": "true",
            "GOTRUE_DISABLE_SIGNUP": "true", "GOTRUE_EXTERNAL_EMAIL_ENABLED": "true", "GOTRUE_EXTERNAL_GOOGLE_ENABLED": "false",
            "GOTRUE_EXTERNAL_PHONE_ENABLED": "false", "GOTRUE_SMTP_HOST": "127.0.0.1", "GOTRUE_SMTP_PORT": "1",
            "GOTRUE_SMTP_ADMIN_EMAIL": "noreply@runtime.local", "GOTRUE_RATE_LIMIT_EMAIL_SENT": "1",
        })
        rest = start("rest", images["rest"], {"PGRST_DB_URI": "postgresql://authenticator@db:5432/" + DATABASE,
            "PGRST_DB_SCHEMAS": "public", "PGRST_DB_EXTRA_SEARCH_PATH": "public,extensions", "PGRST_DB_ANON_ROLE": "anon",
            "PGRST_JWT_SECRET": secret, "PGRST_DB_MAX_ROWS": "1000"})
        storage_env = {"ANON_KEY": anon, "SERVICE_KEY": service, "AUTH_JWT_SECRET": secret,
            "DATABASE_URL": "postgresql://supabase_storage_admin@db:5432/" + DATABASE,
            "FILE_STORAGE_BACKEND_PATH": "/mnt", "STORAGE_BACKEND": "file", "TENANT_ID": "stub", "GLOBAL_S3_BUCKET": "stub",
            "FILE_SIZE_LIMIT": "52428800", "ENABLE_IMAGE_TRANSFORMATION": "false", "S3_PROTOCOL_ENABLED": "false"}
        storage = start("storage", images["storage"], storage_env, extra=["--tmpfs", "/mnt:rw,mode=0700,size=536870912"])
        for _ in range(100):
            if all(inspect(cid)["State"]["Running"] for cid in (auth, rest, storage)):
                break
            time.sleep(0.2)
        files = json.loads((FILES / "storage-manifest.json").read_text())
        objects = {o["id"]: o for o in baseline["storage.objects"]}
        tar_buffer = io.BytesIO()
        attributes = []
        with tarfile.open(fileobj=tar_buffer, mode="w") as tar:
            for item in files:
                obj = objects[item["id"]]
                name = PurePosixPath("stub/stub") / item["bucket_id"] / item["name"]
                if obj.get("version"):
                    name = name / obj["version"]
                if name.is_absolute() or ".." in name.parts:
                    raise RuntimeError("Unsafe object path.")
                data = (FILES / item["path"]).read_bytes()
                require(hashlib.sha256(data).hexdigest() == item["sha256"], "original file hash verified " + item["id"])
                info = tarfile.TarInfo(str(name)); info.mode = 0o600; info.size = len(data)
                tar.addfile(info, io.BytesIO(data))
                attributes.append({"path": "/mnt/" + str(name), "contentType": (obj.get("metadata") or {}).get("mimetype", "application/octet-stream")})
        run(["docker", "exec", "-i", storage, "tar", "-xf", "-", "-C", "/mnt"], "restore-storage-files", tar_buffer.getvalue())
        set_attributes = "const fs=require('fs'),x=require('fs-xattr');(async()=>{for(const a of JSON.parse(fs.readFileSync(0,'utf8'))){await x.set(a.path,'user.supabase.content-type',a.contentType);await x.set(a.path,'user.supabase.cache-control','no-cache')}})().catch(()=>process.exit(1));"
        run(["docker", "exec", "-i", storage, "node", "-e", set_attributes], "storage-file-attributes", json.dumps(attributes).encode())
        source = run(["git", "archive", "HEAD"], "copy-app-source").stdout
        app_dir = folder / "app"; app_dir.mkdir()
        with tarfile.open(fileobj=io.BytesIO(source)) as tar:
            members = [m for m in tar.getmembers() if PurePosixPath(m.name).parts[0] not in {"tests", "scripts", "docs", "supabase", ".github"}]
            tar.extractall(app_dir, members=members, filter="data")
        (app_dir / "node_modules").symlink_to(ROOT / "node_modules", target_is_directory=True)
        config = {"folder": str(folder), "appDir": str(app_dir), "root": str(ROOT), "api": api, "app": app,
            "transportContainer": storage,
            "anon": anon, "service": service, "club": CLUB, "files": files,
            "meetings": baseline["public.meetings"], "password": secrets.token_urlsafe(24), "fixtureSuffix": secrets.token_hex(6)}
        config_path = folder / "runtime-config.json"; config_path.write_text(json.dumps(config, ensure_ascii=False))
        seed = "INSERT INTO public.profiles(id,display_name) SELECT id,'로컬 흐름 검증 '||(raw_user_meta_data->>'fixture_role') FROM auth.users WHERE raw_user_meta_data->>'fixture_run'='" + config["fixtureSuffix"] + "' ON CONFLICT(id) DO NOTHING; "
        seed += "INSERT INTO public.members(user_id,role) SELECT id,(raw_user_meta_data->>'fixture_role')::public.member_role FROM auth.users WHERE raw_user_meta_data->>'fixture_run'='" + config["fixtureSuffix"] + "' AND raw_user_meta_data->>'fixture_role'<>'none';"
        seed_file = folder / "seed.sql"; seed_file.write_text(seed)
        # The browser runner requests this seed through a one-shot host callback,
        # implemented as a fixed SQL file invocation rather than a database URL.
        config["dbContainer"] = db; config["database"] = DATABASE; config["seedFile"] = str(seed_file)
        config_path.write_text(json.dumps(config, ensure_ascii=False))
        print("Isolated service copies and original file bytes ready. Running actual browser login and downloads.", flush=True)
        run(["node", "scripts/local-service-flow.mjs", str(config_path)], "browser-runtime")
        browser_report = json.loads((folder / "browser-report.json").read_text())
        require(browser_report["passed"], "actual browser flow checks passed")
        # Stop write-capable services before the final immutable-row comparison.
        run(["docker", "stop", auth, storage], "stop-runtime-services")
        after = snapshot()
        (folder / "runtime-after.json").write_text(json.dumps(after, ensure_ascii=False))
        fixture_ids = set(browser_report["fixtureIds"])
        storage_hash_updates = 0
        for name, original in baseline.items():
            if name == "storage.migrations":
                require(storage_migrations_match(original, after[name]), "Storage migration ledger preserves IDs and metadata; only service SQL checksums may refresh")
                prior = {r["id"]: r["hash"] for r in original}
                storage_hash_updates = sum(row["hash"] != prior[row["id"]] for row in after[name])
                continue
            # Original rows must remain byte-equivalent as JSON, including auth hashes.
            actual = canonical(after[name])
            require(all(row in actual for row in canonical(original)), "every original row preserved: " + name)
            if name.startswith(("public.", "legacy_multiclub.", "storage.")):
                allowed = after[name]
                if name == "public.profiles":
                    allowed = [r for r in allowed if r["id"] not in fixture_ids]
                if name == "public.members":
                    allowed = [r for r in allowed if r["user_id"] not in fixture_ids]
                require(canonical(allowed) == canonical(original), "no unintended business/file/archive rows: " + name)
        require(hashlib.sha256((BACKUP / "database.dump").read_bytes()).hexdigest() == manifest["sha256"], "original production archive unchanged")
        require((BACKUP / "manifest.json").read_bytes() == original_manifest, "original production manifest unchanged")
        report = {"passed": True, "completed_at": datetime.now(timezone.utc).isoformat(), "checks": passed,
            "browser_checks": browser_report["checks"], "file_downloads": browser_report["fileDownloads"],
            "production_connection_used": False, "original_auth_users": len(baseline["auth.users"]),
            "external_oauth_tested": False, "fixture_accounts_only": True, "original_archive_sha256": manifest["sha256"]}
        report["storage_migration_checksum_updates"] = storage_hash_updates
    except Exception as error:
        (folder / "failure.json").write_text(json.dumps({"passed":False,"error":str(error) if isinstance(error,RuntimeError) else type(error).__name__,"checks":passed}))
        raise
    finally:
        for cid in containers:
            log = run(["docker", "logs", cid], "collect-service-logs", check=False)
            (folder / (cid[:12] + ".log")).write_bytes(log.stdout + log.stderr)
        for cid in reversed(containers):
            if inspect(cid)["Config"]["Labels"].get(label) != "true":
                raise RuntimeError("Unexpected cleanup target.")
            run(["docker", "rm", "-f", "-v", cid], "remove-test-container")
        if network:
            run(["docker", "network", "rm", network], "remove-test-network")
        if app_dir and app_dir.is_dir():
            if app_dir.is_symlink() or app_dir.parent != folder or app_dir.name != "app":
                raise RuntimeError("Unexpected copied-app cleanup target.")
            # rmtree unlinks the node_modules symlink; it does not follow it.
            shutil.rmtree(app_dir)
        if local_snapshot.exists():
            run(["node", "scripts/check-local-records.mjs", "compare", str(local_snapshot)], "local-after")
            passed.append("existing local application data unchanged")
    (folder / "verification-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps({"passed":True,"preservationChecks":len(passed),"browserChecks":len(report['browser_checks']),"downloads":report['file_downloads'],"report":str(folder/'verification-report.json')},ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, RuntimeError) else type(error).__name__)
        raise SystemExit(1)
