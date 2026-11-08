"""Safety regressions: a Preview change cannot replace Production secrets/deploy."""
import base64
import copy
import importlib.util
import io
import json
from pathlib import Path
import unittest

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


if __name__ == "__main__":
    unittest.main()
