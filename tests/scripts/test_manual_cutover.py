"""Manual generation and read-only observer authority boundaries."""
import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock,patch

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('test_manual',ROOT/'scripts/manual-cutover.py')
manual=importlib.util.module_from_spec(spec)
spec.loader.exec_module(manual)
RUN={'run_id':'a'*32,'release_sha256':'b'*64}


class ManualBoundaries(unittest.TestCase):
    def test_frozen_archive_control_uses_exact_nine_columns_and_nulls(self):
        body=b'COPY cutover_control.run (id, run_id, project_ref, club_id, release_sha256, stage, frozen_at, backup_sha256, restore_sha256) FROM stdin;\n1\taaaa\tproject\tclub\trelease\tfrozen\t2026-11-10 00:00:00+00\t\\N\t\\N\n\\.\n'
        with patch.object(manual.subprocess,'run',return_value=SimpleNamespace(returncode=0,stdout=body)):
            control=manual.archive_control(b'PGDMPsynthetic')
            self.assertEqual(control['stage'],'frozen');self.assertIsNone(control['backup_sha256'])

    def test_old_online_archive_has_no_frozen_control_and_is_rejected(self):
        with patch.object(manual.subprocess,'run',return_value=SimpleNamespace(returncode=0,stdout=b'-- no control schema')),self.assertRaises(RuntimeError):
            manual.archive_control(b'PGDMPsynthetic')

    def test_mutation_is_only_exported_never_sent_to_observer(self):
        with tempfile.TemporaryDirectory(dir=ROOT/'.local-backups') as folder:
            c=manual.Observer.__new__(manual.Observer)
            c.folder,c.action=Path(folder),'synthetic'
            c.query=Mock()
            sql='BEGIN; '+manual.core.assert_sql(RUN['run_id'],RUN['release_sha256'],['frozen'])+'UPDATE cutover_control.run SET stage=\'backup_verified\'; COMMIT;'
            with self.assertRaises(manual.SQLReady) as ready:c.sql(sql)
            c.query.assert_not_called()
            saved=ready.exception.path.read_text()
            self.assertIn("session_user<>'postgres'",saved)
            self.assertIn('Verification expired',saved)
            self.assertIn("lock_timeout='5s'",saved)

    def test_observer_only_sends_select_with_server_read_only_flag(self):
        c=manual.Observer.__new__(manual.Observer);c._token='synthetic-token'
        with patch.object(manual.io.ro,'request',return_value=b'[{"value":true}]') as network:
            c.query('SELECT true AS value')
            args=network.call_args.args
            self.assertTrue(json.loads(args[2])['read_only'])
            self.assertEqual(args[0],'https://api.supabase.com/v1/projects/'+manual.core.PROJECT+'/database/query')
            network.reset_mock()
            with self.assertRaises(RuntimeError):c.query('CREATE SCHEMA should_not_run')
            network.assert_not_called()

    def test_observed_assertion_checks_same_run_without_forging_executor_role(self):
        c=manual.Observer.__new__(manual.Observer);c.run=RUN;c.query=Mock(return_value=[{'matches':True}])
        body=manual.core.assert_sql(RUN['run_id'],RUN['release_sha256'],['frozen'])
        c.sql(body,read_only=True)
        query=c.query.call_args.args[0]
        self.assertIn(RUN['run_id'],query);self.assertIn("stage IN ('frozen')",query)
        self.assertTrue(query.startswith('SELECT '))
        self.assertIn("session_user<>'postgres'",body)
        with self.assertRaises(RuntimeError):c.sql(body.replace('frozen','invented'),read_only=True)

    def test_freeze_initialization_is_one_atomic_transaction_with_exact_target(self):
        body=manual.freeze_sql(RUN)
        self.assertTrue(body.startswith('BEGIN;'))
        self.assertEqual(body.count('COMMIT;'),1)
        self.assertLess(body.index('Retained club mismatch'),body.index('CREATE SCHEMA cutover_control'))
        self.assertLess(body.index('Incomplete write barrier coverage'),body.index('COMMIT;'))
        self.assertIn("stage='frozen'",body)
        self.assertIn(manual.core.CLUB,body)
        self.assertNotIn('DROP TABLE',body)

    def test_cancel_cannot_remove_guards_after_conversion(self):
        body=manual.cancel_sql(RUN)
        self.assertIn("stage IN ('frozen','backup_verified')",body)
        self.assertIn('Already converted; cancellation forbidden',body)
        self.assertLess(body.index('Migration baseline changed'),body.index('DROP FUNCTION'))

    def test_invalid_run_rejected_before_sql_generation(self):
        with self.assertRaises(RuntimeError):manual.freeze_sql({**RUN,'run_id':"x'; drop schema public"})

    def test_unknown_read_query_refused_before_network(self):
        c=manual.Observer.__new__(manual.Observer);c.query=Mock()
        with self.assertRaises(RuntimeError):c.sql('SELECT arbitrary()',read_only=True)
        c.query.assert_not_called()


if __name__=='__main__':unittest.main()
