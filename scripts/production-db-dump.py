#!/usr/bin/env python3
"""Prompt for the EXISTING DB password and make a read-only custom-format dump.

Run in your own terminal. Never pass the password as a command-line argument.
This does not restore, migrate, reset a password, or create a database role.
"""
import argparse
from datetime import datetime, timezone
import getpass
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
PROJECT = "chvprcpdfgivnfkgwkem"
CONTAINER = "supabase_db_book-club"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    if not sys.stdin.isatty():
        raise RuntimeError("Run in your terminal to enter the existing DB password privately.")
    os.umask(0o077)
    if (ROOT / "supabase/.temp/project-ref").read_text().strip() != PROJECT:
        raise RuntimeError("Linked project differs from the verified production project.")
    url = urlsplit((ROOT / "supabase/.temp/pooler-url").read_text().strip())
    if (url.scheme not in ("postgres", "postgresql") or not url.hostname or
            not url.hostname.endswith(".pooler.supabase.com") or
            url.username != "postgres." + PROJECT or url.password or url.path != "/postgres"):
        raise RuntimeError("Unexpected production connection metadata.")
    # Session-mode pooler, fixed project user, TLS certificate + hostname checks.
    connection = ["--host", url.hostname, "--port", "5432", "--username", "postgres." + PROJECT,
                  "--dbname", "postgres", "--no-password"]
    docker = ["docker", "exec", "-i", "-e", "PGSSLMODE=verify-full",
              "-e", "PGSSLROOTCERT=/etc/ssl/certs/ca-certificates.crt",
              "-e", "PGOPTIONS=-c default_transaction_read_only=on -c lock_timeout=5000",
              CONTAINER, "sh", "-c", 'IFS= read -r PGPASSWORD; export PGPASSWORD; exec "$@"', "sh"]
    password = getpass.getpass("기존 운영 DB 비밀번호 (화면에 표시되지 않음): ")
    if not password or "\n" in password or "\r" in password:
        raise RuntimeError("A non-empty, single-line password is required.")
    payload = (password + "\n").encode()
    password = None
    probe = subprocess.run(docker + ["psql", *connection, "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
                                    "-c", "SELECT current_setting('transaction_read_only')"],
                           input=payload, capture_output=True)
    if probe.returncode or probe.stdout.strip() != b"on":
        raise RuntimeError("Verified read-only connection failed; no dump was created. Check the existing password/TLS/connectivity without resetting credentials.")
    backup_root = ROOT / ".local-backups"
    backup_root.mkdir(mode=0o700, exist_ok=True)
    if backup_root.is_symlink() or backup_root.resolve().parent != ROOT:
        raise RuntimeError("Backup directory must be inside this repository.")
    if subprocess.run(["git", "check-ignore", "-q", str(backup_root / "production-probe")], cwd=ROOT).returncode:
        raise RuntimeError("Backup directory is not excluded from Git.")
    folder = backup_root / ("production-dump-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ"))
    folder.mkdir(mode=0o700)
    target = folder / "database.dump"
    with target.open("xb") as output:
        result = subprocess.run(docker + ["pg_dump", *connection, "--format=custom"],
                                input=payload, stdout=output, stderr=subprocess.PIPE)
    payload = None
    if result.returncode or target.stat().st_size == 0:
        raise RuntimeError("Dump incomplete. The private folder contains an unverified partial file; no completion manifest was written.")
    with target.open("rb") as stream:
        verified = subprocess.run(["docker", "exec", "-i", CONTAINER, "pg_restore", "--list"],
                                  stdin=stream, capture_output=True)
    if verified.returncode:
        raise RuntimeError("Archive contents could not be listed; restore verification is still required.")
    (folder / "database.contents.txt").write_bytes(verified.stdout)
    with target.open("rb") as stream:
        checksum = hashlib.file_digest(stream, "sha256").hexdigest()
    manifest = {
        "project_ref": PROJECT, "completed_at": datetime.now(timezone.utc).isoformat(),
        "format": "pg_dump-custom", "bytes": target.stat().st_size,
        "sha256": checksum,
        "archive_list_verified": True, "restore_verified": False, "writes_frozen": False,
        "includes_storage_bytes": False, "includes_cluster_roles": False,
        "remaining": ["role/grant compatibility review", "isolated restore verification",
                      "Storage file copy", "final backup after external write freeze"],
    }
    (folder / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"DB archive saved: {folder}. This online copy still needs an isolated restore and a final backup after write freeze.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, RuntimeError) else type(error).__name__, file=sys.stderr)
        sys.exit(1)
