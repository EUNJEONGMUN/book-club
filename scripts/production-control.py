#!/usr/bin/env python3
"""Owner-held credentials, fixed cutover actions over an owner-only Unix socket.

No password/token is written to disk, argv, replies or logs. Starting this server
does not install maintenance or change the DB. Each later action is explicit.
"""
import argparse
import base64
from datetime import datetime, timezone
import getpass
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import secrets
import socket
import ssl
import subprocess
import sys
import tarfile
import tempfile
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, build_opener, HTTPSHandler

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('control_operator', ROOT / 'scripts/production-cutover.py')
operator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(operator)
core, dbio = operator.core, operator.io
PROJECT = 'prj_hKx77tEnplZb6H7gZuvCMKjRyiDE'
TEAM = 'scone-s-projects'
NODE = '/opt/homebrew/opt/node@24/bin/node'
CLI = ROOT / '.local-backups/production-cli/node_modules/@vercel/cli-support/dist/vc.js'
CANDIDATES = {'maintenance-bridge': '1', 'recovery-app': '0', 'single-club-app': '0'}
DOMAIN = 'book-club-five-nu.vercel.app'


class Control:
    def __init__(self, folder, token, password):
        self.folder = Path(folder).resolve()
        core.require(self.folder.parent == ROOT / '.local-backups' and self.folder.name.startswith('operation-run-'), 'Unexpected private run folder.')
        self.run = json.loads((self.folder / 'run-plan.json').read_bytes())
        self.release, self.manifest, digest = operator.release_state(ROOT / self.run['release_folder'])
        core.require(self.run['release_sha256'] == digest and self.run['project_ref'] == core.PROJECT and self.run['club_id'] == core.CLUB, 'Run/release mismatch.')
        core.require(CLI.is_file() and re.fullmatch(r'[A-Za-z0-9_-]{20,300}', token), 'Expected installed CLI and owner token.')
        self.token = token
        self.connection = dbio.ProductionConnection(password, allow_writes=True)
        self.engine = core.Engine(self.connection, self.folder, self.run['run_id'], digest)
        self.engine.identity()  # verified read-only; no schema/control row creation
        self.project = self.api('GET', '/v9/projects/' + PROJECT)
        core.require(self.project['id'] == PROJECT and self.project['name'] == 'book-club' and self.project['nodeVersion'] == '24.x', 'Vercel project/build mismatch.')
        self.organization = self.project['accountId']
        self.env_baseline = self.env_state()
        core.save(self.folder, 'production-environment-baseline-' + secrets.token_hex(4) + '.json', self.env_baseline)
        self.owner_acceptance = {'recorded_at': datetime.now(timezone.utc).isoformat(), 'session_logout_accepted': True,
            'production_cutover_authorized_in_chat': True, 'password_and_token_persisted': False}
        core.save(self.folder, 'owner-acceptance-' + secrets.token_hex(4) + '.json', self.owner_acceptance)

    def api(self, method, path, body=None):
        allowed_read = path.startswith(('/v9/projects/' + PROJECT, '/v10/projects/' + PROJECT + '/env', '/v13/deployments/')) or path == '/v3/env/pull/' + PROJECT + '/production'
        allowed_promote = bool(re.fullmatch('/v10/projects/' + PROJECT + r'/promote/dpl_[A-Za-z0-9]+', path))
        core.require((method == 'GET' and allowed_read) or (method == 'POST' and allowed_promote and body == {}), 'Unlisted Vercel operation.')
        url = 'https://api.vercel.com' + path + ('&' if '?' in path else '?') + urlencode({'slug': TEAM})
        request = Request(url, data=None if body is None else json.dumps(body).encode(), method=method,
            headers={'Authorization': 'Bearer ' + self.token, 'Content-Type': 'application/json'})
        opener = build_opener(dbio.ro.NoRedirect(), HTTPSHandler(context=ssl.create_default_context(cafile='/etc/ssl/cert.pem')))
        try:
            with opener.open(request, timeout=60) as response:
                raw = response.read()
                return json.loads(raw) if raw else {'status': response.status}
        except HTTPError as error:
            raise RuntimeError('Vercel request failed: HTTP ' + str(error.code)) from None

    def env_state(self):
        result = self.api('GET', '/v10/projects/' + PROJECT + '/env')
        envs = [e for e in result['envs'] if 'production' in e.get('target', [])]
        for key in ('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'):
            core.require(sum(e['key'] == key for e in envs) == 1, 'Missing/duplicate Production connection record.')
        return sorted([{'id': e['id'], 'key': e['key'], 'target': sorted(e['target']), 'type': e.get('type'),
            'visibility': e.get('visibility'), 'value_sha256': core.sha(json.dumps(e.get('value'), sort_keys=True).encode())} for e in envs], key=lambda e:e['id'])

    def env_unchanged(self):
        core.require(self.env_state() == self.env_baseline, 'Production environment changed; inspect before continuing.')
        # Current list endpoint redacts values even with deprecated decrypt=true.
        # This is the exact read-only endpoint used by pinned official CLI env pull.
        values = self.api('GET', '/v3/env/pull/' + PROJECT + '/production')['env']
        core.require(values.get('NEXT_PUBLIC_SUPABASE_URL') == 'https://' + core.PROJECT + '.supabase.co', 'Production Supabase URL not verified; no changes made.')
        key = values.get('NEXT_PUBLIC_SUPABASE_ANON_KEY')
        core.require(isinstance(key, str) and len(key.split('.')) == 3, 'Production public Auth key not verified.')
        part = key.split('.')[1]
        claims = json.loads(base64.urlsafe_b64decode(part + '=' * (-len(part) % 4)))
        core.require(claims.get('ref') == core.PROJECT and claims.get('role') == 'anon', 'Production public Auth key targets another project.')

    def deployment(self, candidate):
        core.require(candidate in CANDIDATES, 'Unknown candidate.')
        return json.loads((self.folder / ('deployment-' + candidate + '.json')).read_bytes())

    def deploy(self, candidate):
        core.require(candidate in CANDIDATES, 'Unknown candidate.')
        core.require(not (self.folder / ('deployment-' + candidate + '.json')).exists(), 'Candidate already submitted; inspect its ID instead of deploying twice.')
        self.env_unchanged()
        operator.release_state(self.release)
        entry = self.manifest['candidates'][candidate]['artifact']
        archive = core.artifact(self.release, entry)
        directory = self.folder / ('source-' + candidate)
        core.require(not directory.exists(), 'Source directory already exists; review possible partial deployment.')
        directory.mkdir(mode=0o700)
        package = core.load('control_source_package', 'prepare-release-candidates.py')
        with tarfile.open(fileobj=io.BytesIO(archive), mode='r:gz') as tar:
            seen = set()
            for item in tar:
                core.require(item.isfile() and package.allowed_path(item.name) and item.name not in seen, 'Unsafe source member.')
                seen.add(item.name)
                target = directory / item.name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(tar.extractfile(item).read())
        local = directory / '.vercel'
        local.mkdir(mode=0o700)
        core.save(local, 'project.json', {'projectId': PROJECT, 'orgId': self.organization, 'projectName': 'book-club'})
        config = self.folder / 'cli-config'
        config.mkdir(mode=0o700, exist_ok=True)
        env = {k: os.environ[k] for k in ('PATH', 'HOME', 'TMPDIR', 'LANG') if k in os.environ}
        env.update(VERCEL_TOKEN=self.token, VERCEL_TELEMETRY_DISABLED='1', NO_UPDATE_NOTIFIER='1', CI='1', VERCEL_ORG_ID=self.organization, VERCEL_PROJECT_ID=PROJECT)
        args = [NODE, str(CLI), 'deploy', str(directory), '--scope', TEAM, '--prod', '--skip-domain', '--yes', '--no-wait', '--json',
            '--global-config', str(config), '--build-env', 'MAINTENANCE_MODE=' + CANDIDATES[candidate], '--env', 'MAINTENANCE_MODE=' + CANDIDATES[candidate]]
        result = subprocess.run(args, env=env, cwd=directory, capture_output=True, timeout=300)
        # CLI output may include configuration or private build diagnostics: never return raw output.
        core.save(self.folder, 'cli-' + candidate + '-stdout.log', result.stdout)
        core.save(self.folder, 'cli-' + candidate + '-stderr.log', result.stderr)
        core.require(result.returncode == 0, 'Candidate submission failed; private CLI logs retained. Do not retry blindly.')
        parsed = json.loads(result.stdout)
        core.save(self.folder, 'cli-' + candidate + '-result.json', parsed)
        dep = parsed.get('deployment', parsed)
        dep_id = dep.get('id', dep.get('deploymentId'))
        core.require(isinstance(dep_id, str) and re.fullmatch(r'dpl_[A-Za-z0-9]+', dep_id), 'Inspect CLI result for deployment ID before retrying.')
        details = self.api('GET', '/v13/deployments/' + dep_id)
        core.require(details.get('projectId') == PROJECT and details.get('target') == 'production', 'Deployment environment/project mismatch.')
        core.require(DOMAIN not in details.get('alias', []), 'Candidate unexpectedly assigned the live domain.')
        receipt = {'id': dep_id, 'url': details['url'], 'candidate': candidate, 'source_sha256': entry['sha256'],
            'maintenance_mode': CANDIDATES[candidate], 'target': details['target'], 'project_id': PROJECT, 'ready_state': details.get('readyState')}
        core.save(self.folder, 'deployment-' + candidate + '.json', receipt)
        self.env_unchanged()
        return receipt

    def candidate_status(self, candidate):
        receipt = self.deployment(candidate)
        d = self.api('GET', '/v13/deployments/' + receipt['id'])
        core.require(d.get('projectId') == PROJECT and d.get('target') == 'production', 'Unexpected deployment identity.')
        return {**receipt, 'ready_state': d.get('readyState'), 'aliases': d.get('alias', [])}

    def backup(self):
        selection = self.folder / 'selected-backup.json'
        return (ROOT / json.loads(selection.read_bytes())['path']).resolve()

    def act(self, request):
        core.require(isinstance(request, dict) and set(request) <= {'action', 'candidate'}, 'Unexpected request fields; no SQL or credentials accepted.')
        action, candidate = request.get('action'), request.get('candidate')
        if action == 'preflight':
            self.engine.identity(); self.env_unchanged()
            expected = sorted(p.name.split('_', 1)[0] for p in (ROOT / 'supabase/migrations').glob('*.sql') if p.name.split('_', 1)[0] <= '20261108000001')
            core.require(self.engine.value("SELECT coalesce(jsonb_agg(version ORDER BY version),'[]'::jsonb) FROM supabase_migrations.schema_migrations;") == expected, 'Production migration baseline changed.')
            core.require(self.engine.value("SELECT to_regnamespace('cutover_control') IS NULL AND to_regnamespace('legacy_multiclub') IS NULL AND to_regnamespace('cutover_guard') IS NULL;"), 'Existing transition state requires review.')
            records = self.engine.snapshot()
            return {'project_id': PROJECT, 'production_ref': core.PROJECT, 'club_id': core.CLUB,
                'current_production_id': self.api('GET', '/v9/projects/' + PROJECT).get('targets', {}).get('production', {}).get('id'),
                'public_counts': {k:len(v) for k,v in records.items() if k.startswith('public.')},
                'auth_users': len(records['auth.users']), 'files': len(records['storage.objects']), 'database_changed': False}
        if action == 'deploy':
            return self.deploy(candidate)
        if action == 'candidate-status':
            return self.candidate_status(candidate)
        if action == 'promote':
            status = self.candidate_status(candidate)
            core.require(status['ready_state'] == 'READY', 'Candidate build not ready.')
            if candidate == 'maintenance-bridge':
                core.require(all(self.candidate_status(c)['ready_state'] == 'READY' for c in CANDIDATES), 'All three candidates must be ready before maintenance.')
            else:
                expected = 'verified' if candidate == 'single-club-app' else 'recovered_verified'
                core.require(self.engine.state()['stage'] == expected, 'Candidate/schema not verified.')
                self.engine.freeze_state()
            self.env_unchanged()
            result = self.api('POST', '/v10/projects/' + PROJECT + '/promote/' + status['id'], {})
            core.save(self.folder, 'promotion-' + candidate + '-' + secrets.token_hex(4) + '.json', {'deployment': status, 'response': result})
            return {'candidate': candidate, 'id': status['id'], 'promotion_requested': True}
        if action == 'begin':
            operator.attestation(self.folder / 'operator-prerequisites.json', self.run,
                ['pending_http_bodies_drained', 'other_postgres_operator_jobs_stopped', 'current_service_versions_and_unprotected_tables_reviewed'])
            operator.http_check(True)
            self.engine.initialize({'maintenance_verified': True, 'external_operator_and_http_drain_attested': True})
        elif action == 'freeze':
            operator.http_check(True); self.engine.freeze()
        elif action == 'backup':
            operator.http_check(True)
            folder = self.engine.capture()
            core.save(self.folder, 'selected-backup.json', {'path': str(folder.relative_to(ROOT))})
            self.engine.approve_backup(folder)
        elif action in ('02', '03', '04'):
            operator.http_check(True); self.engine.migrate('202611080000' + action)
        elif action == 'compare':
            self.engine.verify_conversion(self.backup())
        elif action == 'recover':
            operator.http_check(True); self.engine.recover(self.backup())
        elif action == 'resume':
            post = operator.attestation(self.folder / 'operator-postcheck.json', self.run,
                ['canonical_domain_verified', 'existing_administrator_session_and_records_verified', 'files_and_anonymous_display_verified'], max_age=300)
            expected = 'single-club-app' if self.engine.state()['stage'] == 'verified' else 'recovery-app'
            status = self.candidate_status(expected)
            core.require(post['candidate'] == expected and post['source_archive_sha256'] == status['source_sha256'] and post['current_deployment_id'] == status['id'], 'Postcheck source/deployment mismatch.')
            operator.http_check(False)
            self.engine.resume(self.backup(), destination_verified=True)
        elif action == 'status':
            pass
        else:
            raise RuntimeError('Unknown fixed action.')
        state = self.engine.state()
        core.save(self.folder, 'control-checkpoint-' + secrets.token_hex(6) + '.json', state)
        return {'stage': state['stage'], 'run_id': state['run_id']}


def serve(folder, allow_writes, accept_logout):
    operator.execution_gate(allow_writes, accept_logout)
    core.require(sys.stdin.isatty(), 'Owner terminal required; never send credentials to chat.')
    os.umask(0o077)
    print('고정 대상: book-club / 부글부글 / 운영 ' + core.PROJECT, flush=True)
    token = getpass.getpass('Vercel 임시 토큰 (저장하지 않음): ')
    password = getpass.getpass('기존 운영 DB 비밀번호 (저장하지 않음): ')
    control = Control(folder, token, password)
    token = password = None
    directory = Path(tempfile.mkdtemp(prefix='book-club-cutover-', dir='/private/tmp'))
    directory.chmod(0o700)
    path = directory / 'control.sock'
    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    server.bind(str(path)); path.chmod(0o600); server.listen(1)
    pointer = control.folder / ('control-' + secrets.token_hex(4) + '.json')
    core.save(pointer.parent, pointer.name, {'socket_path': str(path), 'run_id': control.run['run_id'], 'pid': os.getpid()})
    print('읽기 전용 대상·TLS·운영 연결 확인 완료. 점검/DB 변경/배포는 아직 실행하지 않았습니다.', flush=True)
    print('제어 창 준비 완료: ' + str(pointer.relative_to(ROOT)), flush=True)
    print('이 터미널을 유지하세요. Ctrl+C는 연결 창만 닫으며 DB 차단을 자동 해제하지 않습니다.', flush=True)
    try:
        while True:
            client, _ = server.accept()
            with client:
                client.settimeout(30)
                raw = b''
                while not raw.endswith(b'\n'):
                    chunk = client.recv(4096)
                    core.require(chunk and len(raw) + len(chunk) <= 8192, 'Invalid control request.')
                    raw += chunk
                try:
                    request = json.loads(raw)
                    result = control.act(request)
                    reply = {'ok': True, 'result': result}
                except Exception as error:
                    reply = {'ok': False, 'error_type': type(error).__name__,
                        'message': str(error) if isinstance(error, RuntimeError) else 'Action stopped; review private diagnostics before retrying.'}
                    core.save(control.folder, 'control-stop-' + secrets.token_hex(6) + '.json', reply)
                client.sendall(json.dumps(reply).encode() + b'\n')
    finally:
        server.close(); path.unlink(missing_ok=True); directory.rmdir()


def send(pointer, action, candidate=None):
    pointer = Path(pointer).resolve()
    core.require(pointer.is_relative_to(ROOT / '.local-backups'), 'Private pointer required.')
    p = json.loads(pointer.read_bytes())
    path = Path(p['socket_path'])
    core.require(path.parent.parent == Path('/private/tmp') and path.parent.name.startswith('book-club-cutover-')
        and path.name == 'control.sock' and path.is_socket() and path.stat().st_uid == os.getuid()
        and path.parent.stat().st_mode & 0o077 == 0 and path.stat().st_mode & 0o077 == 0, 'Unsafe/missing owner socket.')
    request = {'action': action}
    if candidate is not None:request['candidate'] = candidate
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
        client.settimeout(900); client.connect(str(path)); client.sendall(json.dumps(request).encode() + b'\n')
        raw = b''
        while not raw.endswith(b'\n'):
            chunk = client.recv(4096)
            core.require(chunk and len(raw) + len(chunk) < 100000, 'Control connection ended; inspect state before retrying.')
            raw += chunk
    return json.loads(raw)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--serve', action='store_true')
    parser.add_argument('--run-folder', type=Path)
    parser.add_argument('--allow-production-writes', action='store_true')
    parser.add_argument('--accept-session-logout', action='store_true')
    parser.add_argument('--control', type=Path)
    parser.add_argument('--action')
    parser.add_argument('--candidate', choices=list(CANDIDATES))
    args = parser.parse_args()
    if args.serve:
        core.require(args.run_folder is not None and args.control is None and args.action is None, 'Specify an offline run folder.')
        serve(args.run_folder, args.allow_production_writes, args.accept_session_logout)
    elif args.control:
        core.require(args.action is not None and not args.allow_production_writes and not args.accept_session_logout, 'Use the already authorized owner server.')
        result = send(args.control, args.action, args.candidate)
        print(json.dumps(result, ensure_ascii=False))
        if not result['ok']:raise SystemExit(1)
    else:
        print('Preparation only. No credentials, connection, deployment or DB change. Owner server must be started explicitly.')


if __name__ == '__main__':
    try:main()
    except Exception as error:
        print('Control stopped: ' + (str(error) if isinstance(error, RuntimeError) else type(error).__name__), file=sys.stderr)
        raise SystemExit(1)
