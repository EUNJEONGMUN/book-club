#!/usr/bin/env python3
"""Restore a run-bound frozen bundle offline. No cloud connection or existing DB reset."""
import argparse
from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('backup_verifier_core', ROOT / 'scripts/cutover-engine.py')
core = importlib.util.module_from_spec(spec)
spec.loader.exec_module(core)


def verify(folder):
    folder = Path(folder).resolve()
    manifest, records = core.read_bundle(folder)
    checks = []
    def check(value, label):
        core.require(value, label)
        checks.append(label)
    def run(args, data=None, required=True):
        result = subprocess.run(args, input=data, capture_output=True, timeout=120)
        if required and result.returncode:
            core.save(folder, 'restore-error-' + secrets.token_hex(5) + '.log', result.stderr)
            raise RuntimeError('Offline restore step failed; private diagnostic retained.')
        return result
    archive = core.artifact(folder, next(a for a in manifest['artifacts'] if a['path'] == 'database.dump'))
    image = run(['docker', 'inspect', '--format', '{{.Config.Image}}', 'supabase_db_book-club']).stdout.decode().strip()
    check(image.startswith('public.ecr.aws/supabase/postgres:17.'), 'cached PostgreSQL17 image selected')
    roles = run(['docker', 'exec', 'supabase_db_book-club', 'pg_dumpall', '-U', 'supabase_admin', '--roles-only', '--no-role-passwords']).stdout
    check(not re.search(rb"\bPASSWORD\s+'", roles, re.I), 'local role bootstrap has no passwords')
    roles = roles.replace(b'CREATE ROLE supabase_admin;\n', b'')
    init = "initdb -D /tmp/restore-data -U supabase_admin --auth=trust --encoding=UTF8 --locale=C >/tmp/initdb.log 2>&1 && exec postgres -D /tmp/restore-data -c listen_addresses= -c unix_socket_directories=/tmp -c shared_preload_libraries="
    container = run(['docker', 'run', '--detach', '--pull', 'never', '--network', 'none', '--name', 'book-club-frozen-restore-' + secrets.token_hex(6),
                     '--label', 'book-club.frozen-restore=true', '--user', 'postgres', '--tmpfs', '/tmp:rw,mode=1777,size=536870912', '--entrypoint', '/bin/sh', image, '-c', init]).stdout.decode().strip()
    core.require(re.fullmatch(r'[a-f0-9]{64}', container), 'Unexpected local restore container ID.')
    def inside(args, data=None, required=True):
        return run(['docker', 'exec', '-i', container, *args], data, required)
    def sql(body):
        return inside(['psql', '-h', '/tmp', '-U', 'supabase_admin', '-d', 'postgres', '-XqAt', '-v', 'ON_ERROR_STOP=1'], ("SET TIME ZONE 'UTC'; " + body).encode()).stdout
    try:
        for _ in range(100):
            if inside(['pg_isready', '-h', '/tmp', '-U', 'supabase_admin'], required=False).returncode == 0:
                break
            time.sleep(0.2)
        else:
            raise RuntimeError('Offline restore container readiness failed.')
        check(run(['docker', 'inspect', '--format', '{{.HostConfig.NetworkMode}}', container]).stdout.strip() == b'none', 'restore has no external network')
        sql(roles.decode())
        inside(['pg_restore', '-h', '/tmp', '-U', 'supabase_admin', '-d', 'postgres', '--exit-on-error'], archive)
        check(True, 'entire frozen archive restored without ignoring errors')
        run_row = json.loads(sql('SELECT to_jsonb(r) FROM cutover_control.run r WHERE id=1;'))
        check(run_row['run_id'] == manifest['run_id'] and run_row['release_sha256'] == manifest['release_sha256']
              and run_row['project_ref'] == core.PROJECT and run_row['club_id'] == core.CLUB
              and run_row['stage'] == 'frozen' and run_row['frozen_at'] == manifest['freeze_before']['frozen_at'],
              'archive itself contains the current run/release/freeze; historical online dump is refused')
        listing = inside(['pg_restore', '--list'], archive).stdout.decode()
        check(not re.search(r';.*\b(BLOB|BLOBS|SUBSCRIPTION)\b', listing), 'no unsupported large-object/subscription archive entries')
        data = inside(['pg_restore', '--data-only', '--no-owner', '--no-acl', '--file=-'], archive).stdout.splitlines()
        blocks, sequences, i = 0, 0, 0
        while i < len(data):
            match = re.fullmatch(rb'COPY (.+) \((.+)\) FROM stdin;', data[i])
            if match:
                expected = []
                i += 1
                while i < len(data) and data[i] != b'\\.':
                    expected.append(data[i]); i += 1
                core.require(i < len(data), 'Incomplete archive COPY block.')
                actual = sql("BEGIN READ ONLY; SET LOCAL DateStyle=ISO; SET LOCAL IntervalStyle=postgres; SET LOCAL extra_float_digits=3; SET LOCAL TIME ZONE 'UTC'; COPY " + match[1].decode() + ' (' + match[2].decode() + ') TO STDOUT; ROLLBACK;').splitlines()
                check(sorted(expected) == sorted(actual), 'all archive rows restored: ' + match[1].decode())
                blocks += 1
            else:
                sequence = re.fullmatch(rb"SELECT pg_catalog.setval\('((?:[^']|'')*)', (-?\d+), (true|false)\);", data[i])
                if sequence:
                    name = sequence[1].decode().replace("''", "'")
                    actual = json.loads(sql('SELECT jsonb_build_array(last_value,is_called) FROM ' + name + ';'))
                    check(actual == [int(sequence[2]), sequence[3] == b'true'], 'sequence restored: ' + name)
                    sequences += 1
            i += 1
        check(blocks > 0 and blocks == sum(' TABLE DATA ' in l for l in listing.splitlines()), 'every full archive data block checked')
        check(sequences == sum(' SEQUENCE SET ' in l for l in listing.splitlines()), 'every sequence checked')
        for name, rows in records.items():
            schema, table = name.split('.', 1)
            actual = json.loads(sql("SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM " + core.ident(schema) + '.' + core.ident(table) + ' t;'))
            check(core.canonical(rows) == core.canonical(actual), 'frozen live records match full archive: ' + name)
        source_schema = inside(['pg_restore', '--schema-only', '--no-owner', '--no-acl', '--file=-'], archive).stdout
        restored_schema = inside(['pg_dump', '-h', '/tmp', '-U', 'supabase_admin', '-d', 'postgres', '--schema-only', '--no-owner', '--no-acl']).stdout
        policy = lambda body: sorted(re.findall(rb'(?ms)^CREATE POLICY .*?;\n', body))
        flags = lambda body: sorted(re.findall(rb'(?m)^ALTER TABLE (?:ONLY )?.+ (?:ENABLE|FORCE) ROW LEVEL SECURITY;$', body))
        check(policy(source_schema) == policy(restored_schema) and flags(source_schema) == flags(restored_schema), 'all RLS policies and enable/force flags restored')
        # The separate public recovery archive must actually restore too, not merely list.
        public_archive = core.artifact(folder, next(a for a in manifest['artifacts'] if a['path'] == 'public.dump'))
        sql('CREATE DATABASE public_recovery_check TEMPLATE postgres;')
        inside(['psql', '-h', '/tmp', '-U', 'supabase_admin', '-d', 'public_recovery_check', '-XqAt', '-v', 'ON_ERROR_STOP=1'],
               b'DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
        inside(['pg_restore', '-h', '/tmp', '-U', 'supabase_admin', '-d', 'public_recovery_check', '--schema=public', '--no-owner', '--exit-on-error'], public_archive)
        for name, rows in records.items():
            if name.startswith('public.'):
                actual = inside(['psql', '-h', '/tmp', '-U', 'supabase_admin', '-d', 'public_recovery_check', '-XqAt', '-v', 'ON_ERROR_STOP=1'],
                                ("SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM public." + core.ident(name.split('.')[1]) + ' t;').encode()).stdout
                check(core.canonical(rows) == core.canonical(json.loads(actual)), 'public recovery archive actually restores rows: ' + name)
        public_schema = inside(['pg_restore', '--schema-only', '--no-owner', '--no-acl', '--file=-'], public_archive).stdout
        restored_public_schema = inside(['pg_dump', '-h', '/tmp', '-U', 'supabase_admin', '-d', 'public_recovery_check', '--schema=public', '--schema-only', '--no-owner', '--no-acl']).stdout
        check(policy(public_schema) == policy(restored_public_schema) and flags(public_schema) == flags(restored_public_schema), 'public recovery archive restores original RLS definitions')
        files = json.loads((folder / 'files.json').read_bytes())
        for i, entry in enumerate(files):
            body = core.artifact(folder, entry)
            target = '/tmp/restored-file-' + str(i)
            inside(['sh', '-c', 'cat > ' + target], body)
            actual = inside(['sha256sum', target]).stdout.split()[0].decode()
            check(actual == entry['sha256'], 'file bytes actually restored and readable: ' + str(i))
        core.read_bundle(folder)
        report_name = 'restore-report-' + secrets.token_hex(8) + '.json'
        report = {'passed': True, 'report_path': report_name, 'run_id': manifest['run_id'], 'release_sha256': manifest['release_sha256'],
                  'backup_manifest_sha256': core.sha((folder / 'manifest.json').read_bytes()), 'copy_blocks': blocks,
                  'sequences': sequences, 'files_verified': len(files), 'network_mode': 'none', 'image': image,
                  'production_connection_used': False, 'existing_local_database_modified': False,
                  'completed_at': datetime.now(timezone.utc).isoformat(), 'checks': checks}
        core.save(folder, report_name, report)
        return report
    finally:
        owned = run(['docker', 'inspect', '--format', '{{index .Config.Labels "book-club.frozen-restore"}}', container]).stdout.strip()
        if owned == b'true':
            run(['docker', 'rm', '--force', '--volumes', container])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('bundle', type=Path)
    args = parser.parse_args()
    os.umask(0o077)
    try:
        result = verify(args.bundle)
        print(json.dumps({'passed': True, 'checks': len(result['checks']), 'copy_blocks': result['copy_blocks'], 'files': result['files_verified']}))
    except Exception as error:
        parser.exit(1, 'Frozen restore verification stopped: ' + (str(error) if isinstance(error, RuntimeError) else type(error).__name__) + '\n')
