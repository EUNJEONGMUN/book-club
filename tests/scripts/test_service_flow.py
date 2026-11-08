import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("service_flow", ROOT / "scripts/verify-local-service-flow.py")
flow = importlib.util.module_from_spec(spec)
spec.loader.exec_module(flow)


class StorageMigrationLedgerComparison(unittest.TestCase):
    def setUp(self):
        self.before = [{"id": 2, "name": "migration", "hash": "a" * 40, "executed_at": "unchanged"}]

    def test_only_sql_file_checksum_refresh_is_allowed(self):
        self.assertTrue(flow.storage_migrations_match(self.before, [{**self.before[0], "hash": "b" * 40}]))

    def test_missing_rows_or_other_metadata_changes_are_rejected(self):
        for after in ([], [{**self.before[0], "id": 3}], [{**self.before[0], "name": "different"}],
                      [{**self.before[0], "executed_at": "changed"}]):
            with self.subTest(after=after):
                self.assertFalse(flow.storage_migrations_match(self.before, after))

    def test_invalid_checksum_is_rejected(self):
        for value in (None, "", "not-a-sha1", "b" * 39):
            with self.subTest(value=value):
                self.assertFalse(flow.storage_migrations_match(self.before, [{**self.before[0], "hash": value}]))


if __name__ == "__main__":
    unittest.main()
