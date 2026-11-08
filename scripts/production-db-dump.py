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
CLUB = "7504fd29-94ee-4134-b4f6-d7adb25fb2ac"
CONTAINER = "supabase_db_book-club"
CA_FILE = ROOT / "scripts/certificates/supabase-prod-ca-2021.crt"
CA_SHA256 = "700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7"

# Only the public certificate is written inside the local container. The password
# follows it on stdin, remains in process memory, and is never a command argument.
CONTAINER_SCRIPT = '''set -eu
certificate=$(mktemp /tmp/book-club-ca.XXXXXX)
trap 'rm -f "$certificate"' EXIT
while IFS= read -r line; do
  printf '%s\\n' "$line"
  if [ "$line" = "-----END CERTIFICATE-----" ]; then break; fi
done > "$certificate"
IFS= read -r PGPASSWORD
export PGPASSWORD
export PGSSLROOTCERT="$certificate"
"$@"
'''


def docker_command():
    return ["docker", "exec", "-i", "-e", "PGSSLMODE=verify-full",
            "-e", "PGCONNECT_TIMEOUT=15",
            "-e", "PGOPTIONS=",
            CONTAINER, "sh", "-c", CONTAINER_SCRIPT, "sh"]


# Check the transaction we actually opened, not whether a pooler forwarded
# libpq's startup options. No database/role/session-wide default is changed.
PROBE_SQL = f"""BEGIN READ ONLY;
SELECT jsonb_build_object(
  'read_only', current_setting('transaction_read_only'),
  'database', current_database(),
  'club_id', (SELECT id::text FROM public.clubs WHERE id = '{CLUB}'::uuid)
);
ROLLBACK;"""


def verify_probe(result):
    if result.returncode:
        raise RuntimeError(failure_reason(result) + " DB 백업은 생성하지 않았습니다.")
    try:
        state = json.loads(result.stdout)
    except (ValueError, UnicodeDecodeError):
        raise RuntimeError("연결 확인 응답을 해석하지 못했습니다. 비밀값은 출력하지 않았으며 DB 백업은 생성하지 않았습니다.") from None
    if not isinstance(state, dict) or state.get("read_only") != "on":
        raise RuntimeError("백업 연결의 읽기 전용 트랜잭션을 확인하지 못했습니다. DB 백업은 생성하지 않았습니다.")
    if state.get("database") != "postgres" or state.get("club_id") != CLUB:
        raise RuntimeError("접속한 DB의 부글부글 식별자가 일치하지 않습니다. DB 백업은 생성하지 않았습니다.")


def connection_input(password):
    certificate = CA_FILE.read_bytes()
    if hashlib.sha256(certificate).hexdigest() != CA_SHA256:
        raise RuntimeError("Supabase CA 파일이 없거나 검증한 인증서와 다릅니다. 인증서 검증을 중단합니다.")
    if "\n" in password or "\r" in password:
        raise RuntimeError("비밀번호에 줄바꿈을 사용할 수 없습니다.")
    return certificate.rstrip(b"\r\n") + b"\n" + password.encode() + b"\n"


def failure_reason(result):
    """Classify errors without printing raw process output or credential values."""
    error = result.stderr.decode(errors="replace").lower()
    if any(term in error for term in ("certificate verify failed", "root certificate", "certificate does not match")):
        return "인증서 검증에 실패했습니다. Supabase CA 인증서와 호스트를 확인해주세요."
    if "password authentication failed" in error or "authentication failed" in error:
        return "비밀번호 인증에 실패했습니다. Supabase 로그인 비밀번호가 아닌 기존 DB 비밀번호를 확인해주세요. 재설정하지는 마세요."
    if "no password supplied" in error:
        return "서버 인증서 검증은 통과했지만 DB 비밀번호가 전달되지 않았습니다."
    if any(term in error for term in ("could not translate host", "name or service not known", "temporary failure in name resolution")):
        return "DB 호스트의 이름을 찾지 못했습니다. DNS/네트워크를 확인해주세요."
    if "lock timeout" in error:
        return "백업에 필요한 읽기 잠금을 기다리다 중단했습니다. 사용량이 적을 때 다시 시도해주세요."
    if any(term in error for term in ("timeout", "timed out", "network is unreachable", "connection refused")):
        return "DB 접속 경로에 연결하지 못했습니다. 네트워크/접속 제한을 확인해주세요."
    if "tenant or user not found" in error:
        return "풀러의 프로젝트/사용자 정보를 확인할 수 없습니다. 저장된 접속 정보 확인이 필요합니다."
    if "permission denied" in error:
        return "백업에 필요한 읽기 권한이 부족합니다. 권한은 자동 변경하지 않았습니다."
    if "cannot connect to the docker daemon" in error or "no such container" in error:
        return "로컬 Docker 또는 Supabase DB 컨테이너가 실행 중인지 확인해주세요."
    return f"연결 확인에 실패했습니다 (종료 코드 {result.returncode}). 비밀번호·설정은 변경하지 않았습니다."


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--diagnose", action="store_true", help="비밀번호 없이 네트워크·서버 인증서만 확인")
    args = parser.parse_args()
    if not args.diagnose and not sys.stdin.isatty():
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
    docker = docker_command()
    password = "" if args.diagnose else getpass.getpass("기존 운영 DB 비밀번호 (화면에 표시되지 않음): ")
    if not args.diagnose and not password:
        raise RuntimeError("A non-empty, single-line password is required.")
    payload = connection_input(password)
    password = None
    probe = subprocess.run(docker + ["psql", *connection, "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
                                    "-c", PROBE_SQL],
                           input=payload, capture_output=True)
    if args.diagnose:
        if b"no password supplied" in probe.stderr.lower():
            print("네트워크 연결과 Supabase 서버 인증서·호스트 검증을 통과했습니다. 비밀번호 인증과 전체 백업은 아직 실행하지 않았습니다.")
            return
        if probe.returncode == 0:
            raise RuntimeError("비밀번호 없이 DB에 연결되었습니다. 접속 설정 확인이 필요하며 백업은 실행하지 않았습니다.")
        raise RuntimeError(failure_reason(probe))
    verify_probe(probe)
    print("서버 인증서·DB 인증·부글부글 식별자·읽기 전용 트랜잭션을 확인했습니다. DB 백업을 시작합니다.", flush=True)
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
        # PostgreSQL pg_dump starts REPEATABLE READ, READ ONLY itself.
        # Use its SQL-level lock timeout instead of startup options.
        result = subprocess.run(docker + ["pg_dump", *connection, "--format=custom", "--lock-wait-timeout=5s"],
                                input=payload, stdout=output, stderr=subprocess.PIPE)
    payload = None
    if result.returncode or target.stat().st_size == 0:
        raise RuntimeError("DB 덤프가 완료되지 않았습니다. " + failure_reason(result) +
                           " 부분 파일에는 완료 manifest를 만들지 않았습니다.")
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
        "probe_transaction_read_only": True, "probe_club_id": CLUB,
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
