"""Operational target, proof and credential boundaries. No credentials/network/DB."""
from datetime import datetime, timedelta, timezone
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('test_operator', ROOT / 'scripts/production-cutover.py')
operator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(operator)
core, io = operator.core, operator.io


class OperationalBoundaries(unittest.TestCase):
    def test_production_pooler_is_the_verified_original_cluster(self):
        self.assertEqual(io.HOST, 'aws-1-ap-northeast-2.pooler.supabase.com')

    def test_target_and_run_sql_are_not_user_supplied_identifiers(self):
        for run in ('bad', "a'; DROP SCHEMA public;--", 'g' * 32):
            with self.subTest(run=run), self.assertRaises(RuntimeError):
                core.assert_sql(run, 'b' * 64, ['frozen'])
        sql = core.assert_sql('a' * 32, 'b' * 64, ['frozen'])
        for text in ("current_database()<>'postgres'", "session_user<>'postgres'", core.PROJECT, core.CLUB, 'release_sha256'):
            self.assertIn(text, sql)

    def test_wrong_project_transport_refused_before_files(self):
        with self.assertRaises(RuntimeError):
            core.Engine(SimpleNamespace(project_ref='teecqonbbmsritclbcyc', kind='production'), Path('/not-used'), 'a' * 32, 'b' * 64)

    def test_read_only_transport_rejects_write_before_subprocess(self):
        c = io.ProductionConnection.__new__(io.ProductionConnection)
        c.allow_writes, c.payload = False, b'synthetic password input\n'
        with patch.object(io.subprocess, 'run') as command:
            with self.assertRaises(RuntimeError):
                c.sql('CREATE SCHEMA should_not_run;')
            command.assert_not_called()
            command.return_value = subprocess.CompletedProcess([], 0, b'{}', b'')
            c.sql('SELECT current_user;', read_only=True)
            args, kwargs = command.call_args
            self.assertIn(b'BEGIN READ ONLY', kwargs['input'])
            self.assertIn(b"SET LOCAL TIME ZONE 'UTC'", kwargs['input'])
            self.assertNotIn('synthetic password', ' '.join(args[0]))

    def test_origin_download_always_has_fresh_nonce_and_fixed_host(self):
        c = io.ProductionConnection.__new__(io.ProductionConnection)
        c._service = 'synthetic service token'
        obj = {'bucket_id': 'discussion-files', 'name': 'meeting/한글.pdf'}
        with patch.object(io.ro, 'request', return_value=b'fixture') as request:
            c.download(obj); c.download(obj)
            first, second = [call.args[0] for call in request.call_args_list]
            self.assertNotEqual(first, second)
            self.assertEqual(urlsplit(first).hostname, core.PROJECT + '.supabase.co')
            self.assertIn('cacheNonce=', first)
            self.assertEqual(request.call_args.args[1]['Cache-Control'], 'no-cache')

    def test_json_wrapper_handles_scalar_queries_without_t_f_decode_errors(self):
        engine = core.Engine.__new__(core.Engine)
        engine.sql = Mock(return_value=SimpleNamespace(stdout=b'{"value":true}'))
        self.assertIs(engine.value('SELECT true AS value;'), True)
        self.assertIn('row_to_json', engine.sql.call_args.args[0])

    def test_migration_has_server_stage_and_real_restore_gate_before_ddl(self):
        engine = core.Engine.__new__(core.Engine)
        engine.run_id, engine.release = 'a' * 32, 'b' * 64
        sql = engine.migration_sql('20261108000002')
        self.assertLess(sql.index('Unverified final backup'), sql.index('DROP POLICY'))
        self.assertIn("stage IN ('backup_verified')", sql)
        for text in ('CREATE TRIGGER cutover_write_barrier', 'INSERT INTO supabase_migrations.schema_migrations', "stage='migrated02'"):
            self.assertLess(sql.index(text), sql.rindex('COMMIT;'))

    def test_recovering_or_unchecked_stage_cannot_resume(self):
        engine = core.Engine.__new__(core.Engine)
        engine.state = Mock(return_value={'stage': 'recovering'})
        with self.assertRaises(RuntimeError):
            engine.resume(Path('/not-read'), destination_verified=True)
        engine.state.assert_called_once()

    def test_stale_or_wrong_run_operator_check_refused(self):
        run = {'project_ref': core.PROJECT, 'club_id': core.CLUB, 'run_id': 'a' * 32, 'release_sha256': 'b' * 64}
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'operator.json'
            data = {**run, 'checked': True, 'maintenance_deployment_id': 'dpl_example', 'checked_at_utc': (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()}
            path.write_text(json.dumps(data))
            with self.assertRaises(RuntimeError):
                operator.attestation(path, run, ['checked'])
            data.update(checked_at_utc=datetime.now(timezone.utc).isoformat(), run_id='c' * 32)
            path.write_text(json.dumps(data))
            with self.assertRaises(RuntimeError):
                operator.attestation(path, run, ['checked'])

    def test_offline_preparation_does_not_construct_production_connection(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / '.local-backups').mkdir()
            release = root / '.local-backups/release-candidates-fixture'
            with patch.object(operator, 'ROOT', root), patch.object(operator, 'release_state', return_value=(release, {}, 'b' * 64)), \
                    patch.object(operator.io, 'ProductionConnection') as connect, patch.object(operator.getpass, 'getpass') as password:
                folder = operator.prepare_run(release)
                plan = json.loads((folder / 'run-plan.json').read_bytes())
                self.assertFalse(plan['production_execution_approved_by_this_file'])
                self.assertEqual(plan['project_ref'], core.PROJECT)
                connect.assert_not_called(); password.assert_not_called()

    def test_mutating_session_requires_explicit_capability_before_terminal_or_network(self):
        with patch.object(operator.sys.stdin, 'isatty') as terminal, patch.object(operator.io, 'ProductionConnection') as connect:
            with self.assertRaises(RuntimeError):
                operator.session(Path('/not-read'), allow_writes=False)
            terminal.assert_not_called(); connect.assert_not_called()

    def test_known_session_loss_requires_separate_acceptance_before_credentials(self):
        with patch.object(operator.sys.stdin, 'isatty') as terminal, patch.object(operator.io, 'ProductionConnection') as connect, \
                patch.object(operator.getpass, 'getpass') as password:
            with self.assertRaisesRegex(RuntimeError, 'session logout'):
                operator.session(Path('/not-read'), allow_writes=True)
            terminal.assert_not_called(); connect.assert_not_called(); password.assert_not_called()

    def test_owner_logout_acceptance_does_not_remove_explicit_write_gate(self):
        with self.assertRaises(RuntimeError):
            operator.execution_gate(allow_writes=False, accept_session_logout=True)
        operator.execution_gate(allow_writes=True, accept_session_logout=True)


if __name__ == '__main__':
    unittest.main()
