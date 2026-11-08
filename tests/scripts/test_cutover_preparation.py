"""Preparation evidence rejection tests; no credentials, DB, Docker or network."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("cutover_preparation", ROOT / "scripts/prepare-single-club-cutover.py")
prep = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prep)


class PreparationGuards(unittest.TestCase):
    def test_path_traversal_and_absolute_paths_rejected(self):
        for value in ("../outside", "/etc/passwd", "files/../../outside"):
            with self.subTest(value=value), self.assertRaises(RuntimeError):
                prep.safe_path(value)

    def test_symlink_and_changed_backup_bytes_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder).resolve()
            (base / "data").write_bytes(b"original")
            item = {"path": "data", "bytes": 8, "sha256": prep.digest(b"original")}
            prep.check_record(item, base)
            (base / "data").write_bytes(b"tampered")
            with self.assertRaises(RuntimeError):
                prep.check_record(item, base)
            (base / "link").symlink_to(base / "data")
            with self.assertRaises(RuntimeError):
                prep.safe_path("link", base)

    def test_online_backup_cannot_be_relabelled_as_frozen(self):
        backup = {"project_ref": prep.PROJECT, "probe_club_id": prep.CLUB, "writes_frozen": True}
        records = {"project_ref": prep.PROJECT, "club_id": prep.CLUB, "writes_frozen": False}
        with patch.object(prep, "read_json", side_effect=[backup, records, {}, {}, {}, {}]):
            with self.assertRaisesRegex(RuntimeError, "classification"):
                prep.evidence_inventory()

    def test_other_project_or_club_rejected(self):
        for field, value in (("project_ref", "another-project"), ("probe_club_id", "another-club")):
            backup = {"project_ref": prep.PROJECT, "probe_club_id": prep.CLUB, field: value}
            records = {"project_ref": prep.PROJECT, "club_id": prep.CLUB}
            with self.subTest(field=field), patch.object(prep, "read_json", side_effect=[backup, records, {}, {}, {}, {}]):
                with self.assertRaisesRegex(RuntimeError, "target"):
                    prep.evidence_inventory()

    def test_edited_inventory_cannot_allow_execution_or_change_target(self):
        expected = {"project_ref": prep.PROJECT, "club_id": prep.CLUB,
                    "execution_allowed": False, "production_ready": False,
                    "online_backup_is_final": False, "sources": [{"sha256": "expected"}]}
        changes = [{"execution_allowed": True}, {"project_ref": "test-db"},
                   {"online_backup_is_final": True}, {"production_ready": True},
                   {"sources": [{"sha256": "different"}]}]
        path = ROOT / ".local-backups/fixture-plan.json"
        for change in changes:
            changed = {**copy.deepcopy(expected), **change}
            with self.subTest(change=change), patch.object(prep, "build_plan", return_value=expected), \
                    patch.object(prep, "read_json", return_value=changed):
                with self.assertRaises(RuntimeError):
                    prep.verify_plan(path)

    def test_added_or_changed_runtime_source_is_rejected(self):
        for current_list in (b"app/page.tsx\napp/unverified.tsx\n", b"app/page.tsx\n"):
            with self.subTest(current_list=current_list), patch.object(prep, "git", side_effect=[
                b"app/page.tsx\n", current_list, b"expected source"
            ]), patch.object(prep, "safe_path") as file:
                file.return_value.read_bytes.return_value = b"changed source"
                with self.assertRaises(RuntimeError):
                    prep.source_inventory()


if __name__ == "__main__":
    unittest.main()
