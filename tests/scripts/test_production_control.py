"""Credential/control transport boundaries; no network, credentials or DB."""
import importlib.util
import base64
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('test_production_control', ROOT/'scripts/production-control.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ControlBoundaries(unittest.TestCase):
    def test_redacted_list_requires_read_only_pull_and_correct_public_project(self):
        control=module.Control.__new__(module.Control)
        control.env_baseline=[{'id':'synthetic'}]
        control.env_state=lambda:control.env_baseline
        part=base64.urlsafe_b64encode(json.dumps({'ref':module.core.PROJECT,'role':'anon'}).encode()).decode().rstrip('=')
        values={'NEXT_PUBLIC_SUPABASE_URL':'https://'+module.core.PROJECT+'.supabase.co','NEXT_PUBLIC_SUPABASE_ANON_KEY':'header.'+part+'.synthetic'}
        with patch.object(control,'api',return_value={'env':values}) as network:
            control.env_unchanged()
            network.assert_called_once_with('GET','/v3/env/pull/'+module.PROJECT+'/production')
            values['NEXT_PUBLIC_SUPABASE_URL']='https://teecqonbbmsritclbcyc.supabase.co'
            with self.assertRaises(RuntimeError):control.env_unchanged()

    def test_server_requires_write_and_logout_flags_before_terminal_or_password(self):
        for writes, logout in ((False,False),(False,True),(True,False)):
            with self.subTest(writes=writes,logout=logout), patch.object(module.sys.stdin,'isatty') as tty, patch.object(module.getpass,'getpass') as password:
                with self.assertRaises(RuntimeError):module.serve(Path('/not-read'),writes,logout)
                tty.assert_not_called();password.assert_not_called()

    def test_no_raw_sql_or_token_fields_accepted(self):
        control=module.Control.__new__(module.Control)
        for request in ({'action':'status','sql':'DROP SCHEMA public'},{'action':'status','token':'synthetic'},{'action':'arbitrary'}):
            with self.subTest(request=request),self.assertRaises(RuntimeError):control.act(request)

    def test_vercel_api_refuses_environment_mutation_or_other_projects_before_network(self):
        control=module.Control.__new__(module.Control)
        for method,path,body in [('POST','/v10/projects/'+module.PROJECT+'/env',{}),('DELETE','/v13/deployments/dpl_synthetic',None),('GET','/v9/projects/not-this-project',None)]:
            with self.subTest(method=method,path=path),patch.object(module,'build_opener') as network:
                with self.assertRaises(RuntimeError):control.api(method,path,body)
                network.assert_not_called()

    def test_promote_new_app_refused_before_db_conversion_verified(self):
        control=module.Control.__new__(module.Control)
        control.candidate_status=lambda c:{'id':'dpl_synthetic','ready_state':'READY'}
        control.engine=SimpleNamespace(state=lambda:{'stage':'backup_verified'})
        with patch.object(control,'api') as network,self.assertRaises(RuntimeError):
            control.act({'action':'promote','candidate':'single-club-app'})
        network.assert_not_called()

    def test_missing_private_control_pointer_is_not_an_implicit_connection(self):
        with patch.object(module.socket,'socket') as connect,self.assertRaises(RuntimeError):
            module.send(Path('/tmp/not-private.json'),'status')
        connect.assert_not_called()

    def test_default_main_is_offline(self):
        with patch.object(module.sys,'argv',['production-control.py']),patch.object(module,'serve') as server,patch.object(module,'send') as client:
            module.main();server.assert_not_called();client.assert_not_called()


if __name__=='__main__':unittest.main()
