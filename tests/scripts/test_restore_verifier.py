"""Regression checks for metadata representations and offline path restrictions."""
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("restore_verifier", ROOT / "scripts/verify-production-restore.py")
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)


class RestoreVerifierGuards(unittest.TestCase):
    def test_api_array_text_matches_postgres_json_array(self):
        common = {"schemaname": "public", "tablename": "meetings", "policyname": "example",
                  "permissive": "PERMISSIVE", "cmd": "SELECT"}
        api = [{**common, "roles": "{authenticated,service_role}"}]
        restored = [{**common, "roles": ["service_role", "authenticated"]}]
        self.assertEqual(verifier.policy_properties(api), verifier.policy_properties(restored))
        self.assertNotEqual(verifier.policy_properties(api), verifier.policy_properties([{**common, "roles": ["anon"]}]))

    def test_unrecognized_array_encodings_stop_verification(self):
        common = {"schemaname": "public", "tablename": "meetings", "policyname": "example",
                  "permissive": "PERMISSIVE", "cmd": "SELECT"}
        for roles in ("authenticated", "{authenticated,}", [1], None):
            with self.subTest(roles=roles), self.assertRaises(RuntimeError):
                verifier.policy_properties([{**common, "roles": roles}])

    def test_external_inputs_are_rejected_before_docker_work(self):
        with self.assertRaises(RuntimeError):
            verifier.private_path(ROOT.parent / "unrelated-database.dump")


if __name__ == "__main__":
    unittest.main()
