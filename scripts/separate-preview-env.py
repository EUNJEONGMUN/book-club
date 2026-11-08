#!/usr/bin/env python3
"""Separate Preview variables without replacing any Production value or deploying.

Run by the account owner. A Vercel token is read with getpass, never persisted.
Default: inspect the exact plan only. --apply enables the reviewed env-only changes.
"""
import argparse
import base64
from datetime import datetime, timezone
import getpass
import hashlib
import json
import os
from pathlib import Path
import re
import ssl
import subprocess
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, build_opener, HTTPSHandler, HTTPRedirectHandler

ROOT = Path(__file__).resolve().parents[1]
PROJECT = "prj_hKx77tEnplZb6H7gZuvCMKjRyiDE"
TEAM = "scone-s-projects"
TEST_REF = "teecqonbbmsritclbcyc"
PRODUCTION_REF = "chvprcpdfgivnfkgwkem"
CORE = ("NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY")
STRIP = (*CORE, "RESEND_API_KEY", "SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID", "SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET")


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def targets(env):
    value = env.get("target", [])
    if not isinstance(value, list) or not all(t in ("production", "preview", "development") for t in value):
        raise RuntimeError("Unknown environment scope; stopped before changing it.")
    return sorted(value)


def plan(envs):
    changes = []
    for key in CORE:
        if len([e for e in envs if e["key"] == key and "production" in targets(e)]) != 1:
            raise RuntimeError("Expected exactly one Production variable for " + key)
    for env in envs:
        if env["key"] not in STRIP or "preview" not in targets(env):
            continue
        # Do not remove a Preview-only or branch override record automatically.
        if "production" not in targets(env) or env.get("gitBranch") or env.get("configurationId") or env.get("customEnvironmentIds"):
            raise RuntimeError("Preview overrides/shared references already exist; inspect before retrying.")
        env_id = env["id"]
        if not re.fullmatch(r"[A-Za-z0-9_-]+", env_id):
            raise RuntimeError("Unexpected variable identifier.")
        changes.append({"id": env_id, "key": env["key"],
                        "target": [t for t in targets(env) if t != "preview"]})
    return changes


def production_view(envs):
    """Preserve record identities and opaque value fingerprints; never save values."""
    result = {}
    for env in envs:
        if "production" not in targets(env):
            continue
        # Opaque encrypted values may be available even for write-only secrets.
        value_fields = {k: env[k] for k in ("value", "vsmValue", "legacyValue") if k in env}
        result[env["id"]] = {
            "key": env["key"], "type": env.get("type"), "visibility": env.get("visibility"),
            "other_targets": [t for t in targets(env) if t != "preview"],
            "gitBranch": env.get("gitBranch"), "configurationId": env.get("configurationId"),
            "value_fingerprint": hashlib.sha256(json.dumps(value_fields, sort_keys=True).encode()).hexdigest(),
            "value_fields_present": sorted(value_fields),
        }
    return result


def validate_keys(keys):
    if keys.get("project_ref") != TEST_REF or keys.get("url") != f"https://{TEST_REF}.supabase.co" or TEST_REF == PRODUCTION_REF:
        raise RuntimeError("Only the verified test database is allowed.")
    for role in ("anon", "service_role"):
        try:
            payload = keys[role].split(".")[1]
            claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        except Exception:
            raise RuntimeError("Expected a test-project legacy JWT key.") from None
        if claims.get("ref") != TEST_REF or claims.get("role") != role:
            raise RuntimeError("Test key project/role mismatch.")
    return dict(zip(CORE, (keys["url"], keys["anon"], keys["service_role"])))


class Client:
    def __init__(self, token, read_only=True):
        self.token = token
        self.read_only = read_only
        context = ssl.create_default_context()
        if sys.platform == "darwin" and Path("/etc/ssl/cert.pem").is_file():
            context.load_verify_locations(cafile="/etc/ssl/cert.pem")
        self.opener = build_opener(NoRedirect(), HTTPSHandler(context=context))

    def request(self, method, path, body=None):
        # No deletion, deployment, project-setting change, or Production value write.
        if getattr(self, "read_only", True) and method != "GET":
            raise RuntimeError("Inspection mode permits GET requests only; no settings can be changed.")
        prefix = f"/v9/projects/{PROJECT}"
        if method == "GET":
            allowed = path in (prefix, f"/v10/projects/{PROJECT}/env") and body is None
        elif method == "PATCH":
            allowed = (re.fullmatch(re.escape(prefix) + r"/env/[A-Za-z0-9_-]+", path) is not None
                       and isinstance(body, dict) and set(body) == {"target"}
                       and body["target"] in (["production"], ["development", "production"]))
        elif method == "POST":
            allowed = (path == f"/v10/projects/{PROJECT}/env" and isinstance(body, dict)
                       and set(body) == {"key", "value", "type", "target", "visibility", "comment"}
                       and body["key"] in CORE and body["target"] == ["preview"]
                       and body["type"] in ("encrypted", "sensitive"))
        else:
            allowed = False
        if not allowed:
            raise RuntimeError("Request outside the reviewed environment-only scope was rejected.")
        params = {"slug": TEAM}
        if method == "GET" and path.endswith("/env"):
            params["decrypt"] = "false"
        request = Request("https://api.vercel.com" + path + "?" + urlencode(params), method=method,
                          headers={"Authorization": "Bearer " + self.token, "Content-Type": "application/json"},
                          data=None if body is None else json.dumps(body).encode())
        try:
            with self.opener.open(request, timeout=30) as response:
                return json.load(response)
        except HTTPError as error:
            raise RuntimeError(f"Vercel request failed (HTTP {error.code}); no response secrets were logged.") from None
        except URLError:
            raise RuntimeError("Vercel connection failed; certificate verification remains enabled.") from None


def failed_report(folder):
    for path in sorted(folder.glob("vercel-env-*.json"), reverse=True):
        report = json.loads(path.read_text())
        if report.get("failed") and report.get("project") == PROJECT and report.get("test_ref") == TEST_REF:
            return path, report
    return None


def inspect_changes(previous, envs):
    """Compare safe metadata only; an empty Secret response is not its value."""
    before = previous["production_before"]
    after = production_view(envs)
    differences = []
    for env_id in sorted(set(before) | set(after)):
        old, new = before.get(env_id), after.get(env_id)
        if old is None or new is None:
            differences.append({"id": env_id, "key": (old or new)["key"],
                                "field": "production_record", "before": old is not None, "after": new is not None})
            continue
        for field in old:
            if old[field] != new.get(field):
                differences.append({"id": env_id, "key": old["key"], "field": field,
                                    "before": old[field], "after": new.get(field)})
    empty_hash = hashlib.sha256(json.dumps({"value": ""}, sort_keys=True).encode()).hexdigest()
    return {"production_before": before, "production_current": after, "differences": differences,
            "baseline_values_were_all_redacted_empty": bool(before) and all(
                e.get("value_fields_present") == ["value"] and e.get("value_fingerprint") == empty_hash
                for e in before.values()),
            "current_value_display": {e["id"]: "redacted_empty" if e.get("value") == "" else
                                      "missing" if "value" not in e else "opaque_not_disclosed"
                                      for e in envs if "production" in targets(e)},
            "secret_plaintext_verified": False, "read_only": True, "settings_changed": False}


def unexpected_production_changes(before, after, scope_updated_ids=()):
    """Allow only observed legacy Secret metadata backfill on scope-patched IDs."""
    unexpected = []
    for env_id in sorted(set(before) | set(after)):
        old, new = before.get(env_id), after.get(env_id)
        if old is None or new is None:
            unexpected.append({"id": env_id, "field": "production_record"})
            continue
        for field in set(old) | set(new):
            if old.get(field) == new.get(field):
                continue
            allowed = (field == "visibility" and env_id in scope_updated_ids
                       and old.get("type") == new.get("type") == "sensitive"
                       and old.get(field) is None and new.get(field) == "secret")
            if not allowed:
                unexpected.append({"id": env_id, "key": old["key"], "field": field})
    return unexpected


def review_resume(folder, source_path, previous, envs):
    """Require a saved GET-only diagnosis and exact original scope progress."""
    prefix = "removed Preview scope: "
    steps = previous.get("completed_steps", [])
    if not all(isinstance(s, str) and s.startswith(prefix) for s in steps):
        raise RuntimeError("Resume supports the inspected scope stage only; inspect partial creates manually.")
    completed = [s[len(prefix):] for s in steps]
    original = previous["remove_preview_only"]
    original_by_key = {c["key"]: c for c in original}
    if len(original_by_key) != len(original) or len(set(completed)) != len(completed) or not set(completed) <= set(original_by_key):
        raise RuntimeError("Unexpected partial-progress journal.")
    updated_ids = {original_by_key[key]["id"] for key in completed}
    baseline = previous["production_before"]
    current = production_view(envs)
    if unexpected_production_changes(baseline, current, updated_ids):
        raise RuntimeError("An unreviewed Production difference remains; use --inspect without applying.")
    inspections = sorted(folder.glob("vercel-inspection-*.json"), reverse=True)
    reviewed = None
    for path in inspections:
        data = json.loads(path.read_text())
        if data.get("source_report") == source_path.name and data.get("project") == PROJECT and data.get("test_ref") == TEST_REF:
            reviewed = (path, data)
            break
    if not reviewed or reviewed[1].get("read_only") is not True or reviewed[1].get("settings_changed") is not False:
        raise RuntimeError("A matching read-only inspection report is required before resuming.")
    if reviewed[1].get("production_current") != current:
        raise RuntimeError("Production metadata changed since inspection; inspect again before resuming.")
    by_id = {e["id"]: e for e in envs}
    for key in completed:
        item = original_by_key[key]
        if targets(by_id[item["id"]]) != item["target"]:
            raise RuntimeError("Completed Preview scope change no longer matches its journal.")
    remaining = plan(envs)
    expected = {c["id"]: c for c in original if c["key"] not in completed}
    if {c["id"]: c for c in remaining} != expected:
        raise RuntimeError("Remaining scope changes differ from the original reviewed plan.")
    return baseline, remaining, updated_ids, reviewed[0]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true")
    mode.add_argument("--inspect", action="store_true", help="Read-only comparison with the latest failed report")
    mode.add_argument("--resume", action="store_true", help="Resume only the diagnosed scope-stage failure")
    args = parser.parse_args()
    os.umask(0o077)
    pointer_path = ROOT / ".local-backups/preview-isolation-current.json"
    pointer = json.loads(pointer_path.read_text())
    folder = (ROOT / pointer["folder"]).resolve()
    if pointer.get("project_ref") != TEST_REF or not folder.is_relative_to(ROOT / ".local-backups"):
        raise RuntimeError("Unexpected test project/evidence folder.")
    if subprocess.run(["git", "check-ignore", "-q", str(folder / "probe")], cwd=ROOT).returncode:
        raise RuntimeError("Private evidence must be excluded from Git.")
    previous = failed_report(folder)
    if args.apply and previous:
        raise RuntimeError("A previous preservation check is unresolved. Use --inspect; --apply is blocked.")
    if args.inspect and not previous:
        raise RuntimeError("No failed report is available for inspection.")
    if args.resume and not previous:
        raise RuntimeError("No failed report is available to resume.")
    writing = args.apply or args.resume
    keys = validate_keys(json.loads((folder / "test-api-keys.json").read_text())) if writing else None
    token = getpass.getpass("Vercel API token (hidden; never saved): ").strip()
    if not token or any(c.isspace() for c in token):
        raise RuntimeError("A valid token is required; do not paste it into chat.")
    client = Client(token, read_only=not writing)
    project = client.request("GET", f"/v9/projects/{PROJECT}")
    if project.get("id") != PROJECT or project.get("name") != "book-club":
        raise RuntimeError("Unexpected Vercel project.")
    list_envs = lambda: client.request("GET", f"/v10/projects/{PROJECT}/env")["envs"]
    before = list_envs()
    if args.inspect:
        result = inspect_changes(previous[1], before)
        result.update(project=PROJECT, test_ref=TEST_REF, source_report=previous[0].name,
                      completed_steps=previous[1].get("completed_steps", []))
        path = folder / ("vercel-inspection-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ") + ".json")
        path.write_text(json.dumps(result, ensure_ascii=False, indent=2))
        os.chmod(path, 0o600)
        print("Read-only inspection complete. No settings changed.")
        print("Compared Production records: " + str(len(result["production_current"])))
        print("Metadata differences: " + json.dumps(result["differences"], ensure_ascii=False))
        print("Baseline values were redacted empty: " + str(result["baseline_values_were_all_redacted_empty"]))
        print("Secret plaintext was not read or verified.")
        print("Report: " + str(path))
        return
    changes = plan(before)
    updated_ids = set()
    resume_inspection = None
    baseline = production_view(before)
    if args.resume:
        baseline, changes, updated_ids, resume_inspection = review_resume(folder, previous[0], previous[1], before)
    for key in CORE:
        if any(e["key"] == key and "preview" in targets(e) and "production" not in targets(e) for e in before):
            raise RuntimeError("Existing Preview variables need inspection before applying again.")
    report = {"project": PROJECT, "test_ref": TEST_REF, "applied": False,
              "production_before": baseline, "remove_preview_only": previous[1]["remove_preview_only"] if args.resume else changes,
              "create_preview_only": list(CORE), "no_deployments_requested": True,
              "secret_values_saved": False, "completed_steps": list(previous[1]["completed_steps"]) if args.resume else [],
              "source_failed_report": previous[0].name if args.resume else None,
              "source_inspection_report": resume_inspection.name if resume_inspection else None,
              "secret_plaintext_verified": False, "production_value_writes": 0}
    report_path = folder / ("vercel-env-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ") + ".json")

    def save():
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2))
        os.chmod(report_path, 0o600)

    save()
    print("Remove Preview scope only: " + ", ".join(c["key"] for c in changes))
    print("Create Preview test connection: " + ", ".join(CORE))
    if not writing:
        print("Read-only plan saved. No settings changed. Use --apply only for this reviewed plan.")
        return
    try:
        for change in changes:
            client.request("PATCH", f"/v9/projects/{PROJECT}/env/{change['id']}", {"target": change["target"]})
            updated_ids.add(change["id"])
            report["completed_steps"].append("removed Preview scope: " + change["key"])
            save()
            current = production_view(list_envs())
            if unexpected_production_changes(baseline, current, updated_ids):
                report["production_at_failure"] = current
                save()
                raise RuntimeError("Unexpected Production preservation difference; stopped. Use --inspect before proceeding.")
        for key, value in keys.items():
            secret = key == "SUPABASE_SERVICE_ROLE_KEY"
            result = client.request("POST", f"/v10/projects/{PROJECT}/env", {
                "key": key, "value": value, "target": ["preview"],
                "type": "sensitive" if secret else "encrypted",
                "visibility": "secret" if secret else "config",
                "comment": "Separate synthetic test DB: " + TEST_REF,
            })
            if result.get("failed"):
                raise RuntimeError("Vercel rejected a test variable; stopped without logging its value.")
            report["completed_steps"].append("created Preview only: " + key)
            save()
        after = list_envs()
        if unexpected_production_changes(baseline, production_view(after), updated_ids):
            raise RuntimeError("Unexpected Production preservation difference; inspect before deployment.")
        for key in CORE:
            matches = [e for e in after if e["key"] == key and "preview" in targets(e)]
            if len(matches) != 1 or targets(matches[0]) != ["preview"] or matches[0].get("comment") != "Separate synthetic test DB: " + TEST_REF:
                raise RuntimeError("Preview scope verification failed.")
        if any(e["key"] in STRIP[len(CORE):] and "preview" in targets(e) for e in after):
            raise RuntimeError("A Production mail/OAuth secret still reaches Preview.")
        report.update(applied=True, production_after=production_view(after), production_records_preserved=True,
                      preview_variables_verified=True, deployment_verification_pending=True)
        save()
        print("Preview settings separated; Production variable records preserved. No deployment created.")
        print("No Production value writes were sent. Secret plaintext is hidden and was not independently verified.")
        print("Report: " + str(report_path))
    except Exception:
        # Fail closed. Never restore Production keys to Preview to hide a failure.
        report["failed"] = True
        save()
        print("Stopped. Production values were never sent in a write. Partial progress: " + str(report_path))
        raise


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, RuntimeError) else type(error).__name__)
        raise SystemExit(1)
