"""Regression checks for metadata representations and offline path restrictions."""
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("restore_verifier", ROOT / "scripts/verify-production-restore.py")
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)
guard_spec = importlib.util.spec_from_file_location('write_guard', ROOT / 'scripts/write-barrier-sql.py')
guard = importlib.util.module_from_spec(guard_spec)
guard_spec.loader.exec_module(guard)


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

    def test_write_guard_generator_refuses_production_database(self):
        for database in ('postgres', 'production', "runtime_verified'; DROP DATABASE postgres; --"):
            for operation in (guard.install, guard.attach, guard.remove):
                with self.subTest(database=database, operation=operation.__name__), self.assertRaises(ValueError):
                    operation(database)

    def test_new_table_guards_are_added_inside_original_migration_transaction(self):
        body = "-- migration\nBEGIN;\nCREATE TABLE public.example(id int);\nNOTIFY pgrst,'reload schema';\nCOMMIT;\n"
        wrapped = guard.guard_migration(body, 'single_club_rehearsal')
        self.assertTrue(wrapped.startswith(body[:body.rindex('COMMIT;')]))
        self.assertTrue(wrapped.endswith('COMMIT;\n'))
        self.assertLess(wrapped.index('FOR t IN SELECT'), wrapped.rindex('COMMIT;'))
        self.assertEqual(wrapped.count('\nCOMMIT;'), 1)

    def test_ambiguous_or_non_atomic_migration_is_rejected(self):
        for body in ('CREATE TABLE example(id int);', 'BEGIN;\nCOMMIT;\nBEGIN;\nCOMMIT;\n',
                     'BEGIN;\nCOMMIT;\nUPDATE public.example SET id=1;'):
            with self.subTest(body=body), self.assertRaises(ValueError):
                guard.guard_migration(body, 'single_club_rehearsal')


if __name__ == "__main__":
    unittest.main()
