"""Backup connection guards; no production credentials or network required."""
import importlib.util
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("production_db_dump", ROOT / "scripts/production-db-dump.py")
dump = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dump)


class ProductionDumpGuards(unittest.TestCase):
    def test_certificate_failure_is_distinct_from_password_failure(self):
        certificate = subprocess.CompletedProcess([], 2, b"", b"SSL error: certificate verify failed")
        password = subprocess.CompletedProcess([], 2, b"", b"FATAL: password authentication failed")
        self.assertIn("인증서 검증", dump.failure_reason(certificate))
        self.assertIn("비밀번호 인증", dump.failure_reason(password))

    def test_unknown_errors_do_not_expose_raw_output(self):
        sensitive = "private database error containing a secret"
        result = subprocess.CompletedProcess([], 2, b"", sensitive.encode())
        self.assertNotIn(sensitive, dump.failure_reason(result))

    def test_changed_ca_is_rejected(self):
        with patch.object(Path, "read_bytes", return_value=b"different certificate"):
            with self.assertRaises(RuntimeError):
                dump.connection_input("sample")

    def test_password_newlines_are_rejected(self):
        for password in ("first\nsecond", "first\rsecond"):
            with self.subTest(password=password), self.assertRaises(RuntimeError):
                dump.connection_input(password)

    def test_special_password_is_stdin_only(self):
        password = "  예시'\"$`\\끝  "
        payload = dump.connection_input(password)
        self.assertTrue(payload.endswith(b"-----END CERTIFICATE-----\n" + password.encode() + b"\n"))
        self.assertNotIn(password, " ".join(dump.docker_command()))

    def test_diagnostics_require_auth_after_tls(self):
        result = subprocess.CompletedProcess([], 2, b"", b"fe_sendauth: no password supplied")
        self.assertIn("서버 인증서 검증은 통과", dump.failure_reason(result))
        command = dump.docker_command()
        self.assertIn("PGSSLMODE=verify-full", command)
        self.assertIn("PGOPTIONS=", command)

    def test_explicit_read_only_result_is_required(self):
        state = {"read_only": "on", "database": "postgres", "club_id": dump.CLUB}
        dump.verify_probe(subprocess.CompletedProcess([], 0, json.dumps(state).encode(), b""))
        state["read_only"] = "off"
        with self.assertRaises(RuntimeError):
            dump.verify_probe(subprocess.CompletedProcess([], 0, json.dumps(state).encode(), b""))

    def test_unexpected_database_or_club_is_rejected(self):
        for change in ({"database": "unexpected"}, {"club_id": None}, {"club_id": "another-club"}):
            state = {"read_only": "on", "database": "postgres", "club_id": dump.CLUB, **change}
            with self.subTest(change=change), self.assertRaises(RuntimeError):
                dump.verify_probe(subprocess.CompletedProcess([], 0, json.dumps(state).encode(), b""))

    def test_unparseable_or_failed_probe_is_rejected(self):
        for result in (subprocess.CompletedProcess([], 0, b"", b""),
                       subprocess.CompletedProcess([], 0, b"on", b""),
                       subprocess.CompletedProcess([], 0, b"null", b""),
                       subprocess.CompletedProcess([], 2, b"{}", b"error")):
            with self.subTest(result=result), self.assertRaises(RuntimeError):
                dump.verify_probe(result)


if __name__ == "__main__":
    unittest.main()
