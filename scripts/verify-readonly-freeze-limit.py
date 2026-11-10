#!/usr/bin/env python3
"""Prove that a DB read-only default is not a cutover write barrier.

Uses fresh synthetic data in unpublished containers on a Docker internal network.
Never accepts a remote DB, credential or project; never changes the local app DB.
"""
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
LABEL = 'book-club.freeze-limitation-verification'


def main():
    if len(sys.argv) != 1:
        raise RuntimeError('No remote targets or credentials accepted.')
    os.umask(0o077)
    folder = ROOT / '.local-backups' / ('freeze-limit-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    folder.mkdir(mode=0o700)
    prefix = 'book-club-freeze-probe-' + str(time.time_ns())
    containers = []
    network = None

    def run(args, data=None, check=True):
        result = subprocess.run(args, input=data, capture_output=True)
        if check and result.returncode:
            (folder / 'last-failure.log').write_bytes(result.stderr)
            raise RuntimeError('Local probe failed; inspect private logs: ' + str(folder))
        return result

    def inspect(name):
        return json.loads(run(['docker', 'inspect', name]).stdout)[0]

    def start(kind, image, args):
        cid = run(['docker', 'run', '-d', '--pull', 'never', '--name', prefix + '-' + kind,
                   '--label', LABEL + '=true', '--network', network, '--network-alias', kind,
                   *args, image] if kind == 'rest' else
                  ['docker', 'run', '-d', '--pull', 'never', '--name', prefix + '-' + kind,
                   '--label', LABEL + '=true', '--network', network, '--network-alias', kind,
                   *args[0], image, *args[1]]).stdout.decode().strip()
        containers.append(cid)
        return cid

    def sql(text, database='freeze_probe', role='freeze_admin'):
        assert database in ('postgres', 'freeze_probe') and role in ('freeze_admin', 'authenticator')
        return run(['docker', 'exec', '-i', db, 'psql', '-h', '/tmp', '-U', role,
                    '-d', database, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], text.encode()).stdout.decode().strip()

    report = None
    try:
        images = {kind: inspect('supabase_' + kind + '_book-club')['Config']['Image'] for kind in ('db', 'rest', 'storage')}
        network = run(['docker', 'network', 'create', '--internal', '--label', LABEL + '=true', prefix]).stdout.decode().strip()
        init = ('initdb -D /tmp/freeze-db -U freeze_admin --auth=trust --encoding=UTF8 --locale=C >/tmp/initdb.log 2>&1 || exit 1; '
                "printf '\\nhost all all 0.0.0.0/0 trust\\n' >> /tmp/freeze-db/pg_hba.conf; "
                'exec postgres -D /tmp/freeze-db -c listen_addresses=* -c unix_socket_directories=/tmp -c shared_preload_libraries=')
        db = start('db', images['db'], (['--user', 'postgres', '--tmpfs', '/tmp:rw,mode=1777,size=268435456', '--entrypoint', 'sh'], ['-c', init]))
        for _ in range(100):
            if run(['docker', 'exec', db, 'pg_isready', '-h', '/tmp', '-U', 'freeze_admin'], check=False).returncode == 0:
                break
            time.sleep(0.15)
        else:
            raise RuntimeError('Probe DB readiness timed out.')
        sql('CREATE DATABASE freeze_probe; CREATE ROLE authenticator LOGIN NOINHERIT; CREATE ROLE authenticated NOLOGIN; GRANT authenticated TO authenticator;', 'postgres')
        sql('CREATE TABLE public.freeze_canary(id integer PRIMARY KEY,value integer NOT NULL); INSERT INTO public.freeze_canary VALUES(1,0); GRANT USAGE ON SCHEMA public TO authenticated; GRANT SELECT,UPDATE ON public.freeze_canary TO authenticated;')
        # This connection existed before ALTER DATABASE and retains its prior default.
        open_connection = sql("ALTER DATABASE freeze_probe SET default_transaction_read_only=on; SELECT json_build_object('read_only',current_setting('transaction_read_only')); UPDATE public.freeze_canary SET value=1 WHERE id=1 RETURNING value;")
        assert open_connection.splitlines()[-1] == '1' and 'off' in open_connection
        # A fresh ordinary API login starts read-only, but may explicitly opt into RW.
        new_connection = sql("SELECT current_setting('transaction_read_only'); BEGIN READ WRITE; SET LOCAL ROLE authenticated; UPDATE public.freeze_canary SET value=2 WHERE id=1 RETURNING value; COMMIT;", role='authenticator')
        assert new_connection.splitlines() == ['on', '2']
        rest = start('rest', images['rest'], ['-e', 'PGRST_DB_URI=postgresql://authenticator@db:5432/freeze_probe',
                     '-e', 'PGRST_DB_SCHEMAS=public', '-e', 'PGRST_DB_ANON_ROLE=authenticated'])
        helper = start('helper', images['storage'], (['--entrypoint', 'node'], ['-e', 'setInterval(()=>{},10000)']))
        probe = r"""(async()=>{
          for(let n=0;n<100;n++){
            try {const r=await fetch('http://rest:3000/freeze_canary?select=value');if(r.status===200)break;} catch{}
            if(n===99)throw Error('not ready');await new Promise(r=>setTimeout(r,150));
          }
          const r=await fetch('http://rest:3000/freeze_canary?id=eq.1',{method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({value:3})});
          process.stdout.write(JSON.stringify({status:r.status,rows:await r.json()}));
        })().catch(()=>{process.stderr.write('Probe HTTP failed');process.exit(1)})"""
        response = json.loads(run(['docker', 'exec', helper, 'node', '-e', probe]).stdout)
        assert response['status'] == 200 and response['rows'] == [{'id': 1, 'value': 3}]
        final = sql("SELECT json_build_object('new_connection_read_only',current_setting('transaction_read_only'),'value',(SELECT value FROM public.freeze_canary WHERE id=1));")
        state = json.loads(final)
        assert state == {'new_connection_read_only': 'on', 'value': 3}
        assert all(inspect(cid)['NetworkSettings']['Ports'] in ({}, None) or all(v is None for v in inspect(cid)['NetworkSettings']['Ports'].values()) for cid in containers)
        assert json.loads(run(['docker', 'network', 'inspect', network]).stdout)[0]['Internal'] is True
        report = {'limitation_reproduced': True, 'usable_as_hard_write_freeze': False,
                  'existing_connection_can_write': True, 'new_connection_starts_read_only': True,
                  'ordinary_login_can_explicitly_start_read_write': True,
                  'actual_postgrest_patch_succeeded': True, 'read_only_default_still_on_after_api_write': True,
                  'external_network_available': False, 'published_ports': False,
                  'production_connection_used': False, 'existing_local_database_changed': False,
                  'data': 'new synthetic canary only', 'postgrest_image': images['rest']}
    finally:
        for cid in reversed(containers):
            info = inspect(cid)
            if info['Config']['Labels'].get(LABEL) != 'true':
                raise RuntimeError('Unexpected cleanup target.')
            logs = run(['docker', 'logs', cid], check=False)
            (folder / (cid[:12] + '.log')).write_bytes(logs.stdout + logs.stderr)
            run(['docker', 'rm', '-f', '-v', cid])
        if network:
            run(['docker', 'network', 'rm', network])
    if report is not None:
        (folder / 'verification-report.json').write_text(json.dumps(report, indent=2))
        print(json.dumps({'limitation_reproduced': True, 'hard_freeze_validated': False,
                          'report': str(folder / 'verification-report.json')}))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, RuntimeError) else type(error).__name__)
        raise SystemExit(1)
