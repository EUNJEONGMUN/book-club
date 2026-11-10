#!/usr/bin/env python3
"""Offline preparation inventory. Never connects, executes SQL, or authorizes cutover."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
PROJECT = "chvprcpdfgivnfkgwkem"
CLUB = "7504fd29-94ee-4134-b4f6-d7adb25fb2ac"
PREVIEW = "565c6cea6fb9e5e9a3447ee46ea8f6a22ed023dd"
OLD_APP = "378cc2e07321fe88d66178fe29cef2dfb4f5a027"
REHEARSAL = "1d3b0ba63081695e1c15983acd2bf9f48d85c8d0"
BACKUP = ".local-backups/production-dump-20261108T052113760121Z"
RECORDS = ".local-backups/production-readonly-20261108T045110487853Z"
RESTORE = ".local-backups/production-restore-verified-20261108T153150952866Z/verification-report.json"
SERVICES = ".local-backups/local-write-barrier-20261108T153144751004Z/verification-report.json"
BRIDGE = ".local-backups/maintenance-bridge-20261108T140830800Z/verification-report.json"
AUDIT = ".local-backups/write-barrier-audit-20261108T141720527220Z/verification-summary.json"
MIGRATIONS = [
    "20261108000002_disable_club_deletion.sql",
    "20261108000003_single_club_schema.sql",
    "20261108000004_preserve_history_and_archive.sql",
]
RUNTIME_DIRS = ("app/", "components/", "lib/", "public/", "supabase/migrations/")
RUNTIME_FILES = {
    ".npmrc", "components.json", "instrumentation-client.ts", "instrumentation.ts",
    "middleware.ts", "next.config.ts", "package.json", "pnpm-lock.yaml",
    "pnpm-workspace.yaml", "postcss.config.mjs", "sentry.edge.config.ts",
    "sentry.server.config.ts", "tsconfig.json", "vercel.json",
}
REHEARSAL_FILES = [
    "scripts/write-barrier-sql.py", "scripts/local-write-barrier.mjs",
    "scripts/verify-local-service-flow.py", "scripts/verify-production-restore.py",
    "scripts/verify-maintenance-bridge.mjs", "scripts/maintenance-bridge.patch",
]


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def git(*args):
    result = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, check=False)
    require(result.returncode == 0, "Local Git evidence unavailable; stopped.")
    return result.stdout


def safe_path(value, base=ROOT):
    relative = Path(value)
    require(not relative.is_absolute() and ".." not in relative.parts, "Unsafe inventory path.")
    base = base.resolve()
    path = base / relative
    require(not any(p.is_symlink() for p in [path, *path.parents] if p != base),
            "Symlink inventory paths are not accepted.")
    require(path.resolve().is_relative_to(base), "Inventory path escapes its folder.")
    require(path.is_file(), "Required local evidence is missing.")
    return path


def record(value):
    data = safe_path(value).read_bytes()
    return {"path": value, "bytes": len(data), "sha256": digest(data)}


def check_record(item, base=ROOT):
    data = safe_path(item["path"], base).read_bytes()
    require(len(data) == item["bytes"] and digest(data) == item["sha256"],
            "Inventory bytes/hash differ; prepare and review again.")


def read_json(value):
    return json.loads(safe_path(value).read_bytes())


def runtime_path(value):
    return value.startswith(RUNTIME_DIRS) or value in RUNTIME_FILES


def source_inventory():
    expected = {p for p in git("ls-tree", "-r", "--name-only", PREVIEW).decode().splitlines()
                if runtime_path(p)}
    current = {p for p in git("ls-files", "--cached", "--others", "--exclude-standard").decode().splitlines()
               if runtime_path(p)}
    require(current == expected, "Runtime/migration file list differs from verified Preview.")
    sources = []
    for path in sorted(expected):
        require(safe_path(path).read_bytes() == git("show", PREVIEW + ":" + path),
                "Runtime/migration contents differ from verified Preview.")
        sources.append(record(path))
    for path in REHEARSAL_FILES:
        require(safe_path(path).read_bytes() == git("show", REHEARSAL + ":" + path),
                "Rehearsal implementation changed; repeat relevant verification first.")
        sources.append(record(path))
    return sources


def evidence_inventory():
    backup = read_json(BACKUP + "/manifest.json")
    records = read_json(RECORDS + "/manifest.json")
    restore, services, bridge, audit = map(read_json, [RESTORE, SERVICES, BRIDGE, AUDIT])
    require(backup["project_ref"] == records["project_ref"] == PROJECT
            and backup["probe_club_id"] == records["club_id"] == CLUB, "Backup target mismatch.")
    # These historical files stay preliminary, even though a later rehearsal succeeded.
    require(backup["writes_frozen"] is False and records["writes_frozen"] is False,
            "Historical online backup classification changed; do not promote it to final.")
    check_record({"path": "database.dump", "bytes": backup["bytes"], "sha256": backup["sha256"]}, ROOT / BACKUP)
    for item in records["artifacts"]:
        check_record(item, ROOT / RECORDS)
    require(restore["passed"] is True and restore["application_schema_rollback_rehearsal"] is True
            and restore["write_barrier_rehearsal"] is True and restore["schema_rehearsal_role"] == "postgres"
            and restore["production_connection_used"] is False
            and restore["archive_sha256"] == backup["sha256"]
            and restore["source_backup"] == BACKUP and restore["earlier_copy"] == RECORDS,
            "Full restore/conversion/recovery evidence does not match this backup.")
    expected_migrations = [{"name": name, "sha256": record("supabase/migrations/" + name)["sha256"]}
                           for name in MIGRATIONS]
    require(restore["migrations"] == expected_migrations, "Migration order/hash differs from rehearsal.")
    require(services["passed"] is True and services["production_connection_used"] is False
            and services["original_archive_sha256"] == backup["sha256"]
            and services["write_barrier"]["full_data_and_bytes_preserved_during_freeze"] is True
            and services["write_barrier"]["frozen_backup_restored"] is True
            and services["write_barrier"]["original_triggers_preserved"] is True,
            "Service write-barrier/recovery evidence is incomplete.")
    require(bridge["passed"] is True and bridge["source_commit"] == OLD_APP
            and bridge["patch_sha256"] == record("scripts/maintenance-bridge.patch")["sha256"]
            and bridge["production_connection_used"] is False
            and bridge["production_deployment_created"] is False,
            "Old-application maintenance evidence mismatch.")
    require(audit["locally_validated"] is True and audit["production_ready"] is False
            and audit["production_mutating_requests"] == 0
            and audit["local_only_guard_source_sha256"] == record("scripts/write-barrier-sql.py")["sha256"]
            and audit["service_images"] == services["service_images"]
            and audit["conversion_rollback_checks"] == len(restore["checks"]) == 296
            and audit["service_flow_checks"] == len(services["service_flow_checks"]) == 40
            and audit["service_preservation_checks"] == len(services["checks"]) == 92
            and audit["original_files"] == records["file_count"] == services["file_downloads"] == 14,
            "Audit/source mismatch.")
    paths = [BACKUP + "/manifest.json", BACKUP + "/database.dump", RECORDS + "/manifest.json",
             RESTORE, SERVICES, BRIDGE, AUDIT]
    paths += [RECORDS + "/" + item["path"] for item in records["artifacts"]]
    return [record(p) for p in paths], {
        "restore_conversion_recovery": len(restore["checks"]),
        "service_flows": len(services["service_flow_checks"]),
        "service_preservation": len(services["checks"]),
        "maintenance_bridge": bridge["check_count"],
        "original_files": records["file_count"],
    }


def build_plan():
    sources = source_inventory()
    evidence, counts = evidence_inventory()
    return {
        "kind": "offline-single-club-preparation-v1", "created_at": datetime.now(timezone.utc).isoformat(),
        "project_ref": PROJECT, "club_id": CLUB, "verified_preview_commit": PREVIEW,
        "last_verified_production_commit": OLD_APP,
        "rehearsal_source_commit": git("rev-parse", REHEARSAL).decode().strip(),
        "local_head_when_prepared": git("rev-parse", "HEAD").decode().strip(),
        "production_ready": False, "execution_allowed": False,
        "live_production_checked_by_this_tool": False,
        "online_backup_is_final": False, "checks": counts,
        "sources": sources, "evidence": evidence,
        "pending": [
            "Prepare and rehearse a controlled hosted execution path; local SQL tools refuse Production.",
            "Agree maintenance window/operator/recovery operator and obtain separate Production approval.",
            "Recheck current project, schema history, service versions/roles and protected tables.",
            "Activate verified old-schema maintenance bridge and drain active uploads/operator writes.",
            "Install/verify external write barrier; preserve existing credentials and read/download access.",
            "Create final frozen full DB/public-recovery/file backups in the same freeze interval; isolated restore.",
            "Apply only 02,03,04 with new-table guards and migration ledger inside each transaction.",
            "Compare original IDs/rows/ACLs/archive/Auth and every Storage file hash; verify protected app candidate.",
            "Choose resume or pre-resume recovery; keep failed state and preserve managed Auth/Storage records.",
            "Coordinate new-app traffic/write reopening; after reopening, preserve new records before any recovery.",
        ],
        "limitations": [
            "A local inventory is not an SQL executor, live freeze proof, final backup, or user approval.",
            "No network/API/DB connection, deployment, push, secret read or Production change is performed.",
            "Hashes detect changed local inputs; this file is not cryptographically signed or an authorization token.",
            "Historical evidence describes its recorded time, not current Production state.",
        ],
    }


def verify_plan(path):
    relative = path.absolute().relative_to(ROOT).as_posix()
    require(relative.startswith(".local-backups/"), "Plan must be in private .local-backups.")
    plan = read_json(relative)
    expected = build_plan()
    # Timestamp and local HEAD are informational; docs/preparation commits do not invalidate runtime evidence.
    for key in expected.keys() - {"created_at", "local_head_when_prepared"}:
        require(plan.get(key) == expected[key], "Preparation inventory differs; prepare and review again.")
    return plan


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify", type=Path, metavar="PLAN_JSON", help="Recheck local inventory only")
    args = parser.parse_args()
    os.umask(0o077)
    try:
        if args.verify:
            plan = verify_plan(args.verify)
            print("Local preparation inventory verified. Production execution remains blocked.")
        else:
            plan = build_plan()
            folder = ROOT / ".local-backups" / ("cutover-plan-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ"))
            folder.mkdir(mode=0o700, parents=True)
            with (folder / "plan.json").open("x", encoding="utf-8") as output:
                json.dump(plan, output, ensure_ascii=False, indent=2)
                output.write("\n")
            print("Offline preparation complete. No Production connection or change.")
            print("Online backup remains preliminary. Production execution remains blocked.")
            print("Plan: " + str(folder / "plan.json"))
    except (RuntimeError, KeyError, ValueError, OSError, TypeError):
        # Never echo raw evidence/DB records or secret-bearing process output.
        parser.exit(1, "Preparation evidence failed validation. No Production action was taken.\n")


if __name__ == "__main__":
    main()
