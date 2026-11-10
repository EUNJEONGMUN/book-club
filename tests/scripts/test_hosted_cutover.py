"""Hosted rehearsal target and transaction guards; no credentials/network/DB."""
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("test_executor", ROOT / "scripts/test-cutover-executor.py")
executor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(executor)


class HostedCutoverGuards(unittest.TestCase):
    def test_production_project_rejected_before_credentials_are_read(self):
        for project in ("chvprcpdfgivnfkgwkem", "another-project", ""):
            with self.subTest(project=project), self.assertRaisesRegex(RuntimeError, "fixed isolated test"):
                executor.TestConnection(project)

    def test_only_fixed_test_database_names_accepted(self):
        for database in ("public", "other_db", "cutover_rehearsal_123; DROP DATABASE postgres", "cutover_rehearsal_abcdef"):
            with self.subTest(database=database), self.assertRaises(RuntimeError):
                executor.assertion(database, "012345abcdef")

    def test_identity_guard_rejects_empty_run_as_well_as_wrong_run(self):
        sql = executor.assertion("postgres", "012345abcdef")
        self.assertIn("IS DISTINCT FROM '012345abcdef'", sql)
        self.assertIn("current_database()<>'postgres'", sql)
        self.assertIn("session_user<>'postgres'", sql)

    def test_managed_barrier_preserves_local_guard_body(self):
        sql = executor.guarded_sql("install", "postgres", "012345abcdef")
        self.assertIn("IF session_user <> 'postgres'", sql)
        self.assertIn("BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE", sql)
        self.assertIn("stage='frozen';\nCOMMIT;", sql)
        self.assertNotIn("Local rehearsal only", sql)
        self.assertIn("REVOKE ALL ON SCHEMA cutover_guard FROM PUBLIC,anon,authenticated,service_role", sql)

    def test_conversion_forbidden_on_existing_preview_database(self):
        with self.assertRaisesRegex(RuntimeError, "newly created test DB"):
            executor.migration_sql("BEGIN;\nCOMMIT;\n", "postgres", "012345abcdef", "20261108000002", "example")

    def test_commit_contains_new_guards_stage_and_ledger_atomically(self):
        body = (ROOT / "supabase/migrations/20261108000003_single_club_schema.sql").read_text()
        sql = executor.migration_sql(body, "cutover_rehearsal_012345abcdef", "012345abcdef", "20261108000003", "single_club_schema")
        self.assertLess(sql.index("Test stage mismatch"), sql.index("LOCK TABLE public.clubs"))
        for text in ("CREATE TRIGGER cutover_write_barrier", "INSERT INTO supabase_migrations.schema_migrations", "stage='migrated03'"):
            self.assertLess(sql.index(text), sql.rindex("COMMIT;"))
        self.assertIn("'migrated02'", sql)

    def test_modified_migration_or_name_rejected(self):
        path = ROOT / "supabase/migrations/20261108000003_single_club_schema.sql"
        for body, name in ((path.read_text() + "\nSELECT 1;", "single_club_schema"), (path.read_text(), "wrong_name")):
            with self.subTest(name=name), self.assertRaisesRegex(RuntimeError, "source differs"):
                executor.migration_sql(body, "cutover_rehearsal_012345abcdef", "012345abcdef", "20261108000003", name)

    def test_barrier_removal_requires_verified_recovery_or_readback(self):
        sql = executor.guarded_sql("remove", "postgres", "012345abcdef")
        self.assertLess(sql.index("'readback_verified','recovered_verified'"), sql.index("DROP FUNCTION"))
        self.assertIn("stage='resumed';\nCOMMIT;", sql)

    def test_local_generator_still_refuses_hosted_database(self):
        with self.assertRaises(ValueError):
            executor.guard.install("postgres")


if __name__ == "__main__":
    unittest.main()
