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
    def __init__(self, token):
        self.token = token
        context = ssl.create_default_context()
        if sys.platform == "darwin" and Path("/etc/ssl/cert.pem").is_file():
            context.load_verify_locations(cafile="/etc/ssl/cert.pem")
        self.opener = build_opener(NoRedirect(), HTTPSHandler(context=context))

    def request(self, method, path, body=None):
        # No deletion, deployment, project-setting change, or Production value write.
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    os.umask(0o077)
    pointer_path = ROOT / ".local-backups/preview-isolation-current.json"
    pointer = json.loads(pointer_path.read_text())
    folder = (ROOT / pointer["folder"]).resolve()
    if pointer.get("project_ref") != TEST_REF or not folder.is_relative_to(ROOT / ".local-backups"):
        raise RuntimeError("Unexpected test project/evidence folder.")
    if subprocess.run(["git", "check-ignore", "-q", str(folder / "probe")], cwd=ROOT).returncode:
        raise RuntimeError("Private evidence must be excluded from Git.")
    keys = validate_keys(json.loads((folder / "test-api-keys.json").read_text()))
    token = getpass.getpass("Vercel API token (hidden; never saved): ").strip()
    if not token or any(c.isspace() for c in token):
        raise RuntimeError("A valid token is required; do not paste it into chat.")
    client = Client(token)
    project = client.request("GET", f"/v9/projects/{PROJECT}")
    if project.get("id") != PROJECT or project.get("name") != "book-club":
        raise RuntimeError("Unexpected Vercel project.")
    list_envs = lambda: client.request("GET", f"/v10/projects/{PROJECT}/env")["envs"]
    before = list_envs()
    changes = plan(before)
    for key in CORE:
        if any(e["key"] == key and "preview" in targets(e) and "production" not in targets(e) for e in before):
            raise RuntimeError("Existing Preview variables need inspection before applying again.")
    baseline = production_view(before)
    report = {"project": PROJECT, "test_ref": TEST_REF, "applied": False,
              "production_before": baseline, "remove_preview_only": changes,
              "create_preview_only": list(CORE), "no_deployments_requested": True,
              "secret_values_saved": False, "completed_steps": []}
    report_path = folder / ("vercel-env-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ") + ".json")

    def save():
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2))
        os.chmod(report_path, 0o600)

    save()
    print("Remove Preview scope only: " + ", ".join(c["key"] for c in changes))
    print("Create Preview test connection: " + ", ".join(CORE))
    if not args.apply:
        print("Read-only plan saved. No settings changed. Use --apply only for this reviewed plan.")
        return
    try:
        for change in changes:
            client.request("PATCH", f"/v9/projects/{PROJECT}/env/{change['id']}", {"target": change["target"]})
            report["completed_steps"].append("removed Preview scope: " + change["key"])
            save()
            if production_view(list_envs()) != baseline:
                raise RuntimeError("Production fingerprints changed; stopped. Do not deploy or retry blindly.")
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
        if production_view(after) != baseline:
            raise RuntimeError("Production fingerprints changed; stop and inspect before deployment.")
        for key in CORE:
            matches = [e for e in after if e["key"] == key and "preview" in targets(e)]
            if len(matches) != 1 or targets(matches[0]) != ["preview"] or matches[0].get("comment") != "Separate synthetic test DB: " + TEST_REF:
                raise RuntimeError("Preview scope verification failed.")
        if any(e["key"] in STRIP[len(CORE):] and "preview" in targets(e) for e in after):
            raise RuntimeError("A Production mail/OAuth secret still reaches Preview.")
        report.update(applied=True, production_after=production_view(after), production_values_preserved=True,
                      preview_variables_verified=True, deployment_verification_pending=True)
        save()
        print("Preview settings separated; Production variable records/fingerprints preserved. No deployment created.")
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
