#!/usr/bin/env python3
"""Export production records/files without changing DB, roles, or configuration.

This is an online preliminary copy, NOT a pg_dump or a cutover recovery point.
Credentials stay in memory; output may contain password hashes and private reviews.
"""
import hashlib
import base64
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import ssl
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, build_opener, HTTPRedirectHandler, HTTPSHandler

ROOT = Path(__file__).resolve().parents[1]
PROJECT = "chvprcpdfgivnfkgwkem"
CLUB = "7504fd29-94ee-4134-b4f6-d7adb25fb2ac"
SCHEMAS = ("public", "auth", "storage", "supabase_migrations", "legacy_multiclub")


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # Never forward credentials to another host.


def request(url, headers, body=None):
    req = Request(url, headers=headers, data=body)
    # python.org installations may have no default CA file on macOS.
    context = ssl.create_default_context()
    if sys.platform == "darwin" and Path("/etc/ssl/cert.pem").is_file():
        context.load_verify_locations(cafile="/etc/ssl/cert.pem")
    try:
        with build_opener(NoRedirect(), HTTPSHandler(context=context)).open(req, timeout=120) as response:
            return response.read()
    except HTTPError as error:
        # Response bodies can contain private SQL/results. Do not log them.
        raise RuntimeError(f"Read request failed: HTTP {error.code}") from None
    except URLError as error:
        raise RuntimeError("Connection failed: " + type(error.reason).__name__) from None


def access_token():
    token = os.environ.get("SUPABASE_ACCESS_TOKEN", "").strip()
    if not token and sys.platform == "darwin":
        for account in ("supabase", "access-token"):
            result = subprocess.run(
                ["security", "find-generic-password", "-s", "Supabase CLI", "-a", account, "-w"],
                capture_output=True, text=True,
            )
            if result.returncode == 0:
                token = result.stdout.strip()
                # The bundled Go CLI stores an encoded keychain value.
                if token.startswith("go-keyring-base64:"):
                    token = base64.b64decode(token.split(":", 1)[1], validate=True).decode()
                elif token.startswith("go-keyring-encoded:"):
                    token = bytes.fromhex(token.split(":", 1)[1]).decode()
                break
    fallback = Path.home() / ".supabase/access-token"
    if not token and fallback.is_file():
        token = fallback.read_text().strip()
    if not re.fullmatch(r"sbp_(?:oauth_)?[a-f0-9]{40}", token):
        raise RuntimeError("Existing Supabase CLI login is unavailable; no credentials were changed.")
    return token


def identifier(name):
    return '"' + name.replace('"', '""') + '"'


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def save(folder, name, value):
    path = folder / name
    data = value if isinstance(value, bytes) else json.dumps(
        value, ensure_ascii=False, indent=2, sort_keys=True
    ).encode()
    with path.open("xb") as stream:
        os.chmod(path, 0o600)
        stream.write(data)
    return {"path": name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def main():
    if len(sys.argv) != 1:
        raise RuntimeError("No arguments accepted; project and export location are fixed.")
    os.umask(0o077)
    backup_root = ROOT / ".local-backups"
    backup_root.mkdir(mode=0o700, exist_ok=True)
    if backup_root.is_symlink() or backup_root.resolve().parent != ROOT:
        raise RuntimeError("Backup directory must be a real directory inside this repository.")
    ignored = subprocess.run(
        ["git", "check-ignore", "-q", str(backup_root / "production-probe")], cwd=ROOT,
    )
    if ignored.returncode:
        raise RuntimeError("Backup directory is not excluded from Git.")
    token = access_token()
    headers = {"Authorization": "Bearer " + token, "Content-Type": "application/json"}
    base = f"https://api.supabase.com/v1/projects/{PROJECT}"

    def get(suffix):
        return json.loads(request(base + suffix, headers))

    def query(sql):
        if not sql.lstrip().upper().startswith("SELECT ") or ";" in sql:
            raise RuntimeError("Only a single SELECT is allowed.")
        return json.loads(request(base + "/database/query", headers,
                                  json.dumps({"query": sql, "read_only": True}).encode()))

    state = query("SELECT current_setting('transaction_read_only') AS read_only")
    if state != [{"read_only": "on"}]:
        raise RuntimeError("Server did not confirm a read-only transaction.")
    project = get("")
    if project.get("id") != PROJECT or project.get("name") != "book-club":
        raise RuntimeError("Unexpected project identity.")
    clubs = query("SELECT id, name FROM public.clubs ORDER BY id")
    if clubs != [{"id": CLUB, "name": "부글부글"}]:
        raise RuntimeError("Expected exactly the verified production club; stopped without changes.")

    started = datetime.now(timezone.utc).isoformat()
    folder = backup_root / ("production-readonly-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ"))
    folder.mkdir(mode=0o700)
    print("Production identity and read-only transaction confirmed.", flush=True)
    artifacts = []
    tables = query("SELECT schemaname, tablename FROM pg_catalog.pg_tables WHERE schemaname IN (" +
                   ",".join(literal(s) for s in SCHEMAS) + ") ORDER BY schemaname, tablename")
    parts = []
    for table in tables:
        schema, name = table["schemaname"], table["tablename"]
        if schema not in SCHEMAS:
            raise RuntimeError("Unexpected schema.")
        qualified = identifier(schema) + "." + identifier(name)
        parts.append("SELECT " + literal(schema + "." + name) + " AS name, " +
                     "COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]'::jsonb) AS rows FROM " +
                     qualified + " t")
    # One statement gives all selected table records a single PostgreSQL snapshot.
    exported = query("SELECT jsonb_object_agg(name, rows) AS records FROM (" + " UNION ALL ".join(parts) + ") all_tables")
    records = exported[0]["records"]
    for table in tables:
        if table["schemaname"] + "." + table["tablename"] not in records:
            raise RuntimeError("Incomplete table export.")
    if records["public.clubs"] != query("SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY to_jsonb(c)::text), '[]'::jsonb) AS rows FROM public.clubs c")[0]["rows"]:
        raise RuntimeError("Club settings changed during export; copy is not complete.")
    artifacts.append(save(folder, "records.json", records))
    counts = {name: len(rows) for name, rows in records.items()}
    artifacts.append(save(folder, "table-counts.json", counts))
    # Supporting metadata for review, not a substitute for a complete schema dump.
    metadata = {
        "columns": query("SELECT * FROM information_schema.columns WHERE table_schema IN (" + ",".join(literal(s) for s in SCHEMAS) + ") ORDER BY table_schema, table_name, ordinal_position"),
        "policies": query("SELECT * FROM pg_catalog.pg_policies WHERE schemaname IN ('public','storage') ORDER BY schemaname, tablename, policyname"),
        "functions": query("SELECT n.nspname AS schema, p.proname AS name, pg_catalog.pg_get_functiondef(p.oid) AS definition FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY p.oid"),
    }
    artifacts.append(save(folder, "metadata.json", metadata))
    backups = get("/database/backups")
    artifacts.append(save(folder, "provider-backups.json", backups))

    objects = records.get("storage.objects", [])
    file_manifest = []
    if objects:
        keys = get("/api-keys?reveal=true")
        service = next((k.get("api_key") for k in keys if k.get("name") == "service_role"), None)
        if not service:
            raise RuntimeError("Existing service-role key unavailable; records saved, files incomplete.")
        file_headers = {"apikey": service, "Authorization": "Bearer " + service}
        (folder / "storage-files").mkdir(mode=0o700)
        for i, obj in enumerate(objects):
            path = quote(obj["bucket_id"], safe="") + "/" + quote(obj["name"], safe="/")
            data = request(f"https://{PROJECT}.supabase.co/storage/v1/object/{path}", file_headers)
            expected_size = (obj.get("metadata") or {}).get("size")
            if expected_size is not None and len(data) != int(expected_size):
                raise RuntimeError("Storage download size differs from recorded metadata.")
            info = save(folder, f"storage-files/{i:05d}.bin", data)
            artifacts.append(info)
            file_manifest.append({**info, "bucket_id": obj["bucket_id"], "name": obj["name"], "id": obj["id"]})
        service = None
        keys = None
    artifacts.append(save(folder, "storage-manifest.json", file_manifest))
    after = query("SELECT COALESCE(jsonb_agg(to_jsonb(o) ORDER BY to_jsonb(o)::text), '[]'::jsonb) AS rows FROM storage.objects o")[0]["rows"]
    if after != objects:
        raise RuntimeError("Storage metadata changed while copying; repeat the copy.")
    manifest = {
        "project_ref": PROJECT, "club_id": CLUB, "started_at": started,
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "kind": "online-preliminary-record-and-file-copy",
        "full_database_dump": False, "restore_verified": False, "writes_frozen": False,
        "table_count": len(records), "file_count": len(file_manifest), "artifacts": artifacts,
        "remaining": ["full schema/roles/data dump", "isolated restore verification", "final copy after write freeze"],
    }
    save(folder, "manifest.json", manifest)  # Completion marker written last.
    print(json.dumps({"folder": str(folder), "tables": len(records), "files": len(file_manifest),
                      "public_counts": {k: v for k, v in counts.items() if k.startswith("public.")},
                      "full_database_dump": False, "restore_verified": False}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Avoid tracebacks/HTTP bodies with credentials or private row values.
        print("Export stopped: " + (str(error) if isinstance(error, RuntimeError) else type(error).__name__), file=sys.stderr)
        sys.exit(1)
