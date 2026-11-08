"""Safety regressions: a Preview change cannot replace Production secrets/deploy."""
import base64
import copy
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("separator", ROOT / "scripts/separate-preview-env.py")
separator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(separator)


def envs():
    return [{"id": "env_" + str(i), "key": key, "target": ["production", "preview"],
             "type": "sensitive", "value": "opaque-original-" + str(i)}
            for i, key in enumerate(separator.STRIP)]


class PreviewSeparatorGuards(unittest.TestCase):
    def test_scope_plan_never_includes_a_secret_value_or_drops_production(self):
        original = envs()
        before = copy.deepcopy(original)
        changes = separator.plan(original)
        self.assertEqual(original, before)
        self.assertEqual(len(changes), len(separator.STRIP))
        self.assertTrue(all(set(c) == {"id", "key", "target"} and c["target"] == ["production"] for c in changes))

    def test_existing_overrides_or_shared_references_stop_before_writes(self):
        for extra in ({"gitBranch": "feature"}, {"configurationId": "shared"},
                      {"target": ["preview"]}, {"customEnvironmentIds": ["custom"]}):
            candidate = envs()
            candidate[0].update(extra)
            with self.subTest(extra=extra), self.assertRaises(RuntimeError):
                separator.plan(candidate)

    def test_production_fingerprint_detects_replacement_but_allows_preview_removal(self):
        original = envs()
        before = separator.production_view(original)
        for env in original:
            env["target"] = ["production"]
        self.assertEqual(separator.production_view(original), before)
        original[0]["value"] = "replaced"
        self.assertNotEqual(separator.production_view(original), before)

    def test_mixed_project_keys_are_rejected(self):
        def jwt(ref, role):
            body = base64.urlsafe_b64encode(json.dumps({"ref": ref, "role": role}).encode()).decode().rstrip("=")
            return "header." + body + ".signature"
        keys = {"project_ref": separator.TEST_REF, "url": f"https://{separator.TEST_REF}.supabase.co",
                "anon": jwt(separator.TEST_REF, "anon"), "service_role": jwt(separator.TEST_REF, "service_role")}
        self.assertEqual(set(separator.validate_keys(keys)), set(separator.CORE))
        for change in ({"service_role": jwt(separator.PRODUCTION_REF, "service_role")},
                       {"anon": jwt(separator.TEST_REF, "service_role")}, {"anon": "invalid"},
                       {"url": f"https://{separator.PRODUCTION_REF}.supabase.co"}):
            with self.subTest(change=list(change)), self.assertRaises(RuntimeError):
                separator.validate_keys({**keys, **change})

    def test_network_guard_blocks_deletion_deployment_and_production_value_writes(self):
        client = separator.Client.__new__(separator.Client)
        client.token = "not-a-real-token"
        client.read_only = False
        prefix = f"/v9/projects/{separator.PROJECT}"
        attempts = [("DELETE", prefix + "/env/env_1", None),
                    ("POST", "/v13/deployments", {}),
                    ("PATCH", prefix, {"name": "other"}),
                    ("PATCH", prefix + "/env/env_1", {"target": ["production"], "value": "changed"}),
                    ("PATCH", prefix + "/env/env_1", {"target": ["preview"]}),
                    ("PATCH", prefix + "/env/env_1", {"target": []}),
                    ("GET", "/v9/projects/other", None),
                    ("POST", f"/v10/projects/{separator.PROJECT}/env", {
                        "key": separator.CORE[0], "value": "changed", "type": "encrypted", "visibility": "config",
                        "target": ["production"], "comment": "test"})]
        for method, path, body in attempts:
            with self.subTest(method=method, path=path), self.assertRaises(RuntimeError):
                client.request(method, path, body)

    def test_only_preview_creates_and_scope_only_patches_reach_the_network(self):
        class Opener:
            def __init__(self):
                self.requests = []
            def open(self, request, timeout):
                self.requests.append(request)
                return io.BytesIO(b'{}')
        client = separator.Client.__new__(separator.Client)
        client.token = "not-a-real-token"
        client.read_only = False
        client.opener = Opener()
        client.request("PATCH", f"/v9/projects/{separator.PROJECT}/env/env_1", {"target": ["production"]})
        client.request("POST", f"/v10/projects/{separator.PROJECT}/env", {
            "key": separator.CORE[0], "value": "test-only", "type": "encrypted", "visibility": "config",
            "target": ["preview"], "comment": "test"})
        client.request("GET", f"/v10/projects/{separator.PROJECT}/env")
        requests = client.opener.requests
        self.assertEqual(json.loads(requests[0].data), {"target": ["production"]})
        self.assertEqual(json.loads(requests[1].data)["target"], ["preview"])
        self.assertIn("decrypt=false", requests[2].full_url)
        self.assertTrue(all(r.full_url.startswith("https://api.vercel.com/") for r in requests))

    def test_inspection_rejects_even_previously_allowed_scope_only_changes(self):
        client = separator.Client.__new__(separator.Client)
        client.read_only = True
        for method, path, body in (
            ("PATCH", f"/v9/projects/{separator.PROJECT}/env/env_1", {"target": ["production"]}),
            ("POST", f"/v10/projects/{separator.PROJECT}/env", {
                "key": separator.CORE[0], "value": "test", "type": "encrypted", "visibility": "config",
                "target": ["preview"], "comment": "test"}),
        ):
            with self.subTest(method=method), self.assertRaisesRegex(RuntimeError, "GET requests only"):
                client.request(method, path, body)

    def test_diagnosis_distinguishes_masked_values_from_actual_secret_verification(self):
        original = envs()
        for env in original:
            env["value"] = ""
        report = {"production_before": separator.production_view(original)}
        current = copy.deepcopy(original)
        current[0].update(target=["production"], visibility="secret")
        diagnosis = separator.inspect_changes(report, current)
        self.assertTrue(diagnosis["baseline_values_were_all_redacted_empty"])
        self.assertFalse(diagnosis["secret_plaintext_verified"])
        self.assertEqual([(d["key"], d["field"], d["before"], d["after"]) for d in diagnosis["differences"]],
                         [(separator.STRIP[0], "visibility", None, "secret")])
        current[1]["value"] = "different-opaque-display"
        diagnosis = separator.inspect_changes(report, current)
        self.assertIn("value_fingerprint", [d["field"] for d in diagnosis["differences"]])

    def test_failure_lookup_uses_only_matching_failed_project_reports(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            matching = {"failed": True, "project": separator.PROJECT, "test_ref": separator.TEST_REF}
            (folder / "vercel-env-1.json").write_text(json.dumps(matching))
            (folder / "vercel-env-2.json").write_text(json.dumps({**matching, "project": "other"}))
            (folder / "vercel-env-3.json").write_text(json.dumps({**matching, "failed": False}))
            path, report = separator.failed_report(folder)
            self.assertEqual(path.name, "vercel-env-1.json")
            self.assertEqual(report, matching)

    def test_secret_metadata_backfill_is_allowed_only_for_the_scope_patched_record(self):
        original = separator.production_view(envs())
        current = copy.deepcopy(original)
        current["env_0"]["visibility"] = "secret"
        self.assertEqual(separator.unexpected_production_changes(original, current, {"env_0"}), [])
        self.assertTrue(separator.unexpected_production_changes(original, current, {"env_1"}))
        current["env_0"]["value_fingerprint"] = "changed"
        self.assertEqual([d["field"] for d in separator.unexpected_production_changes(original, current, {"env_0"})],
                         ["value_fingerprint"])
        current = copy.deepcopy(original)
        current["env_0"].update(type="encrypted", visibility="config")
        self.assertTrue(separator.unexpected_production_changes(original, current, {"env_0"}))

    def test_real_failure_shape_resumes_without_repeating_the_completed_patch(self):
        original = envs()
        for env in original:
            env["value"] = ""
        previous = {"failed": True, "project": separator.PROJECT, "test_ref": separator.TEST_REF,
                    "production_before": separator.production_view(original), "remove_preview_only": separator.plan(original),
                    "completed_steps": ["removed Preview scope: RESEND_API_KEY"]}
        current = copy.deepcopy(original)
        current[3].update(target=["production"], visibility="secret")

        class Backend:
            def __init__(self, token, read_only):
                self.envs = copy.deepcopy(current)
                self.calls = []
            def request(self, method, path, body=None):
                self.calls.append((method, path, copy.deepcopy(body)))
                if method == "GET":
                    return {"envs": copy.deepcopy(self.envs)} if path.endswith("/env") else {"id": separator.PROJECT, "name": "book-club"}
                if method == "PATCH":
                    row = next(e for e in self.envs if e["id"] == path.rsplit("/", 1)[-1])
                    row.update(target=body["target"], visibility="secret")
                    return {}
                if method == "POST":
                    self.envs.append({"id": "new_" + body["key"], **body})
                    return {"created": {"id": self.envs[-1]["id"]}}
                raise AssertionError("Unexpected method")

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp).resolve()
            folder = root / ".local-backups/preview-test"
            folder.mkdir(parents=True)
            source = folder / "vercel-env-20260101.json"
            source.write_text(json.dumps(previous))
            inspection = {**separator.inspect_changes(previous, current), "source_report": source.name,
                          "project": separator.PROJECT, "test_ref": separator.TEST_REF}
            inspection_path = folder / "vercel-inspection-20260102.json"
            inspection_path.write_text(json.dumps(inspection))
            (root / ".local-backups/preview-isolation-current.json").write_text(json.dumps({"folder": ".local-backups/preview-test", "project_ref": separator.TEST_REF}))
            (folder / "test-api-keys.json").write_text("{}")
            backend = Backend("unused", False)
            desired = dict(zip(separator.CORE, ("test-url", "test-anon", "test-admin")))
            with patch.object(separator, "ROOT", root), patch.object(separator, "Client", return_value=backend), \
                 patch.object(separator, "validate_keys", return_value=desired), \
                 patch.object(separator.subprocess, "run", return_value=type("Result", (), {"returncode": 0})()), \
                 patch.object(separator.getpass, "getpass", return_value="not-a-real-token"), \
                 patch.object(separator.sys, "argv", ["script", "--resume"]), patch("sys.stdout", new_callable=io.StringIO):
                separator.main()
            writes = [(method, path, body) for method, path, body in backend.calls if method != "GET"]
            self.assertEqual(len([w for w in writes if w[0] == "PATCH"]), 5)
            self.assertFalse(any(path.endswith("/env/env_3") for method, path, body in writes))
            self.assertTrue(all(set(body) == {"target"} and body["target"] == ["production"] for method, path, body in writes if method == "PATCH"))
            self.assertTrue(all(body["target"] == ["preview"] for method, path, body in writes if method == "POST"))
            saved = [json.loads(p.read_text()) for p in folder.glob("vercel-env-*.json")]
            self.assertTrue(any(r.get("applied") and r["production_value_writes"] == 0 and not r["secret_plaintext_verified"] for r in saved))
            # A changed current scope must not be accepted from a stale diagnosis.
            changed = copy.deepcopy(current)
            changed[0]["target"] = ["production"]
            with self.assertRaises(RuntimeError):
                separator.review_resume(folder, source, previous, changed)
            inspection_path.unlink()
            with self.assertRaisesRegex(RuntimeError, "inspection report"):
                separator.review_resume(folder, source, previous, current)


if __name__ == "__main__":
    unittest.main()
