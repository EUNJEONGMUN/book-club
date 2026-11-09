#!/usr/bin/env python3
"""Execute the actual operational engine only in new network-none local restores."""
from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('operational_io', ROOT / 'scripts/cutover-io.py')
io = importlib.util.module_from_spec(spec)
spec.loader.exec_module(io)
core = io.core
BACKUP = ROOT / '.local-backups/production-dump-20261108T052113760121Z'
COPIED = ROOT / '.local-backups/production-readonly-20261108T045110487853Z'
RELEASE = ROOT / '.local-backups/release-candidates-20261109T143843928389Z'
FIXTURE = 'f5000000-0000-0000-0000-000000000999'


def main():
    os.umask(0o077)
    folder = ROOT / '.local-backups' / ('operational-rehearsal-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    folder.mkdir(mode=0o700)
    checks = []
    def check(value, label):
        core.require(value, label)
        checks.append(label)
    def run(args, data=None, required=True):
        result = subprocess.run(args, input=data, capture_output=True, timeout=120)
        if required and result.returncode:
            core.save(folder, 'local-error-' + secrets.token_hex(4) + '.log', result.stderr)
            raise RuntimeError('Isolated rehearsal command failed; private log retained.')
        return result
    archive = (BACKUP / 'database.dump').read_bytes()
    original_manifest = (BACKUP / 'manifest.json').read_bytes()
    check(core.sha(archive) == json.loads(original_manifest)['sha256'], 'immutable original archive verified')
    prepare = core.load('operational_release_check', 'prepare-release-candidates.py')
    prepare.verify(RELEASE)
    release = core.sha((RELEASE / 'manifest.json').read_bytes())
    file_entries = json.loads((COPIED / 'storage-manifest.json').read_bytes())
    file_map = {item['id']: item for item in file_entries}
    image = run(['docker', 'inspect', '--format', '{{.Config.Image}}', 'supabase_db_book-club']).stdout.decode().strip()
    check(image.startswith('public.ecr.aws/supabase/postgres:17.'), 'cached PostgreSQL17 image')
    roles = run(['docker', 'exec', 'supabase_db_book-club', 'pg_dumpall', '-U', 'supabase_admin', '--roles-only', '--no-role-passwords']).stdout
    check(not re.search(rb"\bPASSWORD\s+'", roles, re.I), 'local bootstrap contains no passwords')
    roles = roles.replace(b'CREATE ROLE supabase_admin;\n', b'')
    local_snapshot = folder / 'existing-local-before.json'
    run(['node', 'scripts/check-local-records.mjs', 'snapshot', str(local_snapshot)])
    active = None
    reports = []
    def refused(action, label):
        try:
            action()
        except (RuntimeError, KeyError, FileNotFoundError, ValueError):
            check(True, label)
            return
        raise RuntimeError('Unsafe action was accepted: ' + label)
    class Local(io.ArchiveTools):
        project_ref, kind = core.PROJECT, 'local-restore'
        def __init__(self, container):
            self.container = container
            state = json.loads(run(['docker', 'inspect', '--format', '{{json .}}', container]).stdout)
            check(state['HostConfig']['NetworkMode'] == 'none' and not state['HostConfig'].get('PortBindings')
                  and state['Config']['Labels'].get('book-club.operational-rehearsal') == 'true', 'operator adapter accepts only its new isolated container')
        def sql(self, body, read_only=False, check=True):
            if read_only:
                body = "BEGIN READ ONLY; SET LOCAL search_path=pg_catalog; SET LOCAL TIME ZONE 'UTC';\n" + body + '\nROLLBACK;'
            return run(['docker', 'exec', '-i', self.container, 'psql', '-h', '/tmp', '-U', 'postgres', '-d', 'postgres', '-XqAt', '-v', 'ON_ERROR_STOP=1'], body.encode(), check)
        def dump(self, public_only=False):
            return run(['docker', 'exec', self.container, 'pg_dump', '-h', '/tmp', '-U', 'postgres', '-d', 'postgres', '-Fc', '--lock-wait-timeout=5s', *(['--schema=public'] if public_only else [])]).stdout
        def download(self, obj):
            item = file_map[obj['id']]
            core.require(item['bucket_id'] == obj['bucket_id'] and item['name'] == obj['name'], 'Original local file identity mismatch.')
            data = (COPIED / item['path']).read_bytes()
            core.require(core.sha(data) == item['sha256'], 'Original file backup hash mismatch.')
            return data
    try:
        for scenario in ('cancel-before-migration', 'full-recovery', 'partial-recovery', 'success-resume'):
            print('Operational engine rehearsal: ' + scenario + ' (local, network none)', flush=True)
            init = "initdb -D /tmp/operator-data -U supabase_admin --auth=trust --encoding=UTF8 --locale=C >/tmp/initdb.log 2>&1 && exec postgres -D /tmp/operator-data -c listen_addresses= -c unix_socket_directories=/tmp -c shared_preload_libraries= -c session_preload_libraries=supautils -c supautils.superuser=supabase_admin -c supautils.privileged_role=supabase_privileged_role -c 'supautils.policy_grants={\"postgres\":[\"storage.objects\"]}'"
            active = run(['docker', 'run', '--detach', '--pull', 'never', '--network', 'none', '--name', 'book-club-operator-' + secrets.token_hex(6),
                          '--label', 'book-club.operational-rehearsal=true', '--user', 'postgres', '--tmpfs', '/tmp:rw,mode=1777,size=536870912', '--entrypoint', '/bin/sh', image, '-c', init]).stdout.decode().strip()
            core.require(re.fullmatch(r'[a-f0-9]{64}', active), 'Unexpected disposable container ID.')
            def admin(body, database='postgres'):
                return run(['docker', 'exec', '-i', active, 'psql', '-h', '/tmp', '-U', 'supabase_admin', '-d', database, '-XqAt', '-v', 'ON_ERROR_STOP=1'], body.encode()).stdout
            for _ in range(100):
                if run(['docker', 'exec', active, 'pg_isready', '-h', '/tmp', '-U', 'supabase_admin'], required=False).returncode == 0:
                    break
                time.sleep(0.2)
            else:
                raise RuntimeError('Isolated operator DB not ready.')
            admin(roles.decode())
            run(['docker', 'exec', '-i', active, 'pg_restore', '-h', '/tmp', '-U', 'supabase_admin', '-d', 'postgres', '--exit-on-error'], archive)
            admin('ALTER DATABASE postgres OWNER TO postgres; CREATE DATABASE untouched_source TEMPLATE postgres;')
            # One new fixture in this clone only proves failed snapshots survive account deletion.
            admin("INSERT INTO auth.users(id,email,aud,role,created_at,updated_at) VALUES('" + FIXTURE + "','operational-synthetic@example.invalid','authenticated','authenticated',now(),now()); INSERT INTO public.profiles(id,display_name) VALUES('" + FIXTURE + "','합성 복구 검증');")
            c = Local(active)
            engine = core.Engine(c, folder / scenario, secrets.token_hex(16), release)
            before = engine.snapshot()
            original_meta = engine.metadata()
            refused(lambda: engine.initialize({'maintenance_verified': True, 'external_operator_and_http_drain_attested': False}), 'missing drain evidence stops initialization')
            engine.initialize({'maintenance_verified': True, 'external_operator_and_http_drain_attested': True})
            engine.freeze()
            if scenario == 'cancel-before-migration':
                refused(lambda: engine.cancel_before_migration(), 'cancellation requires original destination verification')
                engine.cancel_before_migration(destination_verified=True)
                check(engine.state()['stage'] == 'cancelled' and engine.snapshot() == before and engine.metadata() == original_meta,
                      'backup/network failure can cancel before migration without restoring/deleting user data')
                reports.append({'scenario': scenario, 'run_id': engine.run_id, 'final_stage': engine.state()['stage']})
                run(['docker', 'rm', '--force', '--volumes', active]); active = None
                continue
            refused(lambda: engine.migrate('20261108000002'), 'migration refused before final backup/restore')
            bundle = engine.capture()
            check(engine.state()['stage'] == 'frozen', 'backup capture alone does not unlock conversion')
            for change, label in [({'run_id': 'f' * 32}, 'wrong-run backup refused'), ({'connection_kind': 'production'}, 'local proof cannot authorize Production')]:
                altered = engine.folder / ('altered-' + secrets.token_hex(4))
                shutil.copytree(bundle, altered)
                state = json.loads((altered / 'manifest.json').read_bytes())
                state.update(change)
                (altered / 'manifest.json').write_text(json.dumps(state))
                refused(lambda: engine.approve_backup(altered), label)
            corrupt = engine.folder / 'corrupt-file-copy'
            shutil.copytree(bundle, corrupt)
            entry = json.loads((corrupt / 'files.json').read_bytes())[0]
            (corrupt / entry['path']).write_bytes(b'corrupt fixture copy')
            refused(lambda: engine.approve_backup(corrupt), 'corrupt file copy rejected before conversion')
            refused(lambda: core.read_bundle(BACKUP), 'historical online backup cannot be relabelled as final')
            c.sql('ALTER TABLE public.profiles DISABLE TRIGGER cutover_write_barrier;')
            refused(engine.freeze_state, 'disabled guard detected')
            c.sql('ALTER TABLE public.profiles ENABLE TRIGGER cutover_write_barrier;')
            # A fake report must not skip the actual restore; the engine invokes the verifier itself.
            core.save(bundle, 'restore-report.json', {'passed': True, 'fake': True})
            engine.approve_backup(bundle)
            check(engine.state()['stage'] == 'backup_verified', 'real full/public/file restore evidence unlocks correct live run')
            check(engine.state()['restore_sha256'] != core.sha((bundle / 'restore-report.json').read_bytes()), 'fake JSON report ignored')
            policy_metadata = engine.metadata()
            failure_sql = engine.migration_sql('20261108000002').replace('COMMIT;', 'SELECT 1/0; COMMIT;')
            failure = c.sql(failure_sql, check=False)
            check(failure.returncode != 0 and b'division by zero' in failure.stderr and engine.state()['stage'] == 'backup_verified'
                  and engine.snapshot() == before and engine.metadata() == policy_metadata,
                  'injected migration failure rolls back policy/data/ledger/stage')
            engine.migrate('20261108000002')
            if scenario != 'partial-recovery':
                engine.migrate('20261108000003')
                engine.migrate('20261108000004')
                refused(lambda: engine.resume(bundle, True), 'resume refused before conversion preservation check')
                engine.verify_conversion(bundle)
                check(engine.state()['stage'] == 'verified', 'all original records/files preserved by real engine conversion')
            if scenario != 'success-resume':
                engine.recover(bundle)
                check(engine.state()['stage'] == 'recovered_verified' and all(core.canonical(rows) == core.canonical(engine.snapshot()[name]) for name, rows in before.items())
                      and engine.metadata() == original_meta, 'full/partial recovery restores rows/ACLs/policies/public schema identity')
            refused(lambda: engine.resume(bundle), 'domain/session operator verification required before resume')
            engine.resume(bundle, True)
            check(engine.state()['stage'] == 'resumed', 'verified engine resumes and removes only its guards')
            refused(lambda: engine.recover(bundle), 'old backup recovery refused after writes resume')
            if scenario != 'success-resume':
                result = json.loads(c.sql("BEGIN; DELETE FROM auth.users WHERE id='" + FIXTURE + "'; SELECT jsonb_build_array((SELECT count(*) FROM public.profiles WHERE id='" + FIXTURE + "'),(SELECT count(*) FROM cutover_failed_public.profiles WHERE id='" + FIXTURE + "')); ROLLBACK;").stdout)
                check(result == [0, 1], 'failed profile snapshot survives live account deletion without cascade')
                deny = c.sql('UPDATE cutover_failed_public.profiles SET display_name=display_name WHERE false;', check=False)
                check(deny.returncode != 0 and b'Failed snapshot is read only' in deny.stderr, 'failed state remains immutable after temporary guard removal')
            base_count = json.loads(admin("SELECT jsonb_build_array((SELECT count(*) FROM auth.users),(SELECT count(*) FROM public.clubs));", 'untouched_source'))
            check(base_count == [23, 1], 'untouched source restore preserved independently')
            reports.append({'scenario': scenario, 'bundle': str(bundle.relative_to(ROOT)), 'run_id': engine.run_id, 'final_stage': engine.state()['stage']})
            run(['docker', 'rm', '--force', '--volumes', active]); active = None
        check((BACKUP / 'database.dump').read_bytes() == archive and (BACKUP / 'manifest.json').read_bytes() == original_manifest, 'original archive/manifest remain immutable')
        run(['node', 'scripts/check-local-records.mjs', 'compare', str(local_snapshot)])
        check(True, 'existing local application database records unchanged')
        core.save(folder, 'verification-report.json', {'passed': True, 'checks': checks, 'scenarios': reports, 'production_connection_used': False,
            'hosted_test_connection_used': False, 'deployments_created': 0, 'network_mode': 'none', 'existing_local_database_modified': False,
            'release_sha256': release, 'production_ready': False})
        print(json.dumps({'passed': True, 'checks': len(checks), 'scenarios': len(reports), 'report': str(folder / 'verification-report.json')}), flush=True)
    except Exception as error:
        core.save(folder, 'failure.json', {'passed': False, 'checks': checks, 'error': str(error) if isinstance(error, RuntimeError) else type(error).__name__})
        print('Operational rehearsal stopped; evidence: ' + str(folder), flush=True)
        raise SystemExit(1)
    finally:
        if active:
            label = run(['docker', 'inspect', '--format', '{{index .Config.Labels "book-club.operational-rehearsal"}}', active]).stdout.strip()
            if label == b'true':
                run(['docker', 'rm', '--force', '--volumes', active])


if __name__ == '__main__':
    main()
