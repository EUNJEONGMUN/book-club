#!/usr/bin/env python3
"""Prepare/inspect by default; interactive mutations require a separately approved window.

No Vercel deploy, password reset, role creation, whole DB restore or DB deletion.
Production sessions are never run by preparation/rehearsal commands.
"""
import argparse
from datetime import datetime, timezone
import getpass
import importlib.util
import json
import os
from pathlib import Path
import secrets
import ssl
import sys
from urllib.error import HTTPError
from urllib.request import Request, build_opener, HTTPSHandler

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('production_operator_io', ROOT / 'scripts/cutover-io.py')
io = importlib.util.module_from_spec(spec)
spec.loader.exec_module(io)
core = io.core
ORIGIN = 'https://book-club-five-nu.vercel.app'
DEFAULT_RELEASE = ROOT / '.local-backups/release-candidates-20261109T143843928389Z'
# Full Auth freeze can clear a browser session. Owner explicitly accepted this on
# 2026-11-10; require that acceptance on each mutating invocation. Data gates stay.


def release_state(folder):
    folder = Path(folder).resolve()
    package = core.load('production_operator_release', 'prepare-release-candidates.py')
    manifest = package.verify(folder)
    report = json.loads((folder / 'candidate-verification.json').read_bytes())
    require = core.require
    require(report['passed'] is True and len(report['builds']) == 3 and all(b['passed'] for b in report['builds'])
            and report['input_manifest_sha256'] == core.sha((folder / 'manifest.json').read_bytes())
            and report['production_database_contacted'] is False and report['deployments_created'] == 0,
            'Release candidate evidence mismatch.')
    return folder, manifest, report['input_manifest_sha256']


def prepare_run(release_folder):
    folder, manifest, digest = release_state(release_folder)
    run = ROOT / '.local-backups' / ('operation-run-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    run.mkdir(mode=0o700)
    identity = {'project_ref': core.PROJECT, 'club_id': core.CLUB, 'run_id': secrets.token_hex(16), 'release_sha256': digest,
                'release_folder': str(folder.relative_to(ROOT)), 'production_execution_approved_by_this_file': False}
    core.save(run, 'run-plan.json', identity)
    core.save(run, 'operator-prerequisites.json', {**identity, 'checked_at_utc': None, 'maintenance_deployment_id': None,
        'pending_http_bodies_drained': False, 'other_postgres_operator_jobs_stopped': False,
        'current_service_versions_and_unprotected_tables_reviewed': False})
    core.save(run, 'operator-postcheck.json', {**identity, 'checked_at_utc': None, 'current_deployment_id': None,
        'candidate': None, 'source_archive_sha256': None, 'canonical_domain_verified': False,
        'existing_administrator_session_and_records_verified': False, 'files_and_anonymous_display_verified': False})
    return run


def attestation(path, run, fields, max_age=900):
    data = json.loads(Path(path).read_bytes())
    core.require(all(data.get(k) == run[k] for k in ('project_ref', 'club_id', 'run_id', 'release_sha256')), 'Operator evidence belongs to another run/release.')
    core.require(all(data.get(name) is True for name in fields), 'Required external operator checks are incomplete.')
    timestamp = datetime.fromisoformat(data['checked_at_utc'])
    core.require(timestamp.tzinfo is not None and 0 <= (datetime.now(timezone.utc) - timestamp).total_seconds() <= max_age, 'Operator external checks are stale.')
    core.require(isinstance(data.get('maintenance_deployment_id', data.get('current_deployment_id')), str)
                 and data.get('maintenance_deployment_id', data.get('current_deployment_id')).startswith('dpl_'), 'Reviewed deployment ID required.')
    return data


def http_check(maintenance):
    context = ssl.create_default_context(cafile='/etc/ssl/cert.pem')
    opener = build_opener(io.ro.NoRedirect(), HTTPSHandler(context=context))
    cases = ['/', '/login', '/more/profile'] if maintenance else ['/login']
    for route in cases:
        try:
            with opener.open(Request(ORIGIN + route + '?cutoverCheck=' + secrets.token_hex(8), headers={'Cache-Control': 'no-cache'}), timeout=20) as response:
                status, headers, body = response.status, response.headers, response.read()
        except HTTPError as error:
            status, headers, body = error.code, error.headers, error.read()
        if maintenance:
            core.require(status == 503 and headers.get('Cache-Control') == 'no-store' and headers.get('Retry-After') == '60'
                         and '기존 기록을 안전하게 보존'.encode() in body, 'Canonical domain is not the reviewed maintenance response.')
        else:
            core.require(status == 200 and '기존 기록을 안전하게 보존'.encode() not in body, 'Canonical domain still in maintenance or unavailable.')


def execution_gate(allow_writes=False, accept_session_logout=False, inspect=False):
    core.require(inspect or allow_writes, 'An explicitly approved Production session flag is required.')
    core.require(inspect or accept_session_logout, 'Production execution blocked: explicit acceptance of possible session logout is required.')


def session(run_folder, allow_writes=False, inspect=False, accept_session_logout=False):
    # Reject missing explicit mutation mode before credentials, network or DB access.
    execution_gate(allow_writes, accept_session_logout, inspect)
    core.require(sys.stdin.isatty(), 'Run in the owner terminal; never enter passwords into chat.')
    folder = Path(run_folder).resolve()
    core.require(folder.parent == ROOT / '.local-backups' and folder.name.startswith('operation-run-'), 'Unexpected run folder.')
    run = json.loads((folder / 'run-plan.json').read_bytes())
    release_folder, manifest, digest = release_state(ROOT / run['release_folder'])
    core.require(run['project_ref'] == core.PROJECT and run['club_id'] == core.CLUB and run['release_sha256'] == digest, 'Run/release target mismatch.')
    print('고정 운영 대상: ' + core.PROJECT + ' / 부글부글 ' + core.CLUB + ' / 실행 ' + run['run_id'], flush=True)
    password = getpass.getpass('기존 운영 DB 비밀번호 (저장하지 않음): ')
    connection = io.ProductionConnection(password, allow_writes=allow_writes and not inspect)
    password = None
    engine = core.Engine(connection, folder, run['run_id'], digest)
    engine.identity()
    if inspect:
        print('운영 식별자·기존 postgres·TLS 읽기 전용 확인 완료. 변경 없음.')
        return
    print('별도 승인된 점검 구간에서만 사용합니다. begin / freeze / backup / verify-backup / 02 / 03 / 04 / compare / recover / resume / cancel / status / quit', flush=True)
    while True:
        action = input('단계> ').strip()
        if action == 'quit':
            print('연결 종료. 설치한 차단/진행 상태는 자동 해제하지 않습니다.')
            return
        try:
            selection = folder / 'selected-backup.json'
            if action == 'begin':
                attestation(folder / 'operator-prerequisites.json', run,
                    ['pending_http_bodies_drained', 'other_postgres_operator_jobs_stopped', 'current_service_versions_and_unprotected_tables_reviewed'])
                http_check(True)
                engine.initialize({'maintenance_verified': True, 'external_operator_and_http_drain_attested': True})
            elif action == 'freeze':
                http_check(True)
                engine.freeze()
            elif action == 'backup':
                http_check(True)
                backup = engine.capture()
                core.save(folder, 'selected-backup.json', {'path': str(backup.relative_to(ROOT))})
                print('차단 중 전체 DB/public/파일 사본 완료. 새 격리 DB에서 실제 복원을 시작합니다.', flush=True)
                engine.approve_backup(backup)
            elif action == 'verify-backup':
                backup = (ROOT / json.loads(selection.read_bytes())['path']).resolve()
                core.require(backup.parent == folder, 'Backup selection escaped the run folder.')
                http_check(True)
                engine.approve_backup(backup)
            elif action in ('02', '03', '04'):
                http_check(True)
                engine.migrate('202611080000' + action)
            elif action in ('compare', 'recover', 'resume', 'cancel'):
                backup = None
                if action != 'cancel':
                    backup = (ROOT / json.loads(selection.read_bytes())['path']).resolve()
                    core.require(backup.parent == folder, 'Backup selection escaped the run folder.')
                if action == 'compare':
                    engine.verify_conversion(backup)
                elif action == 'recover':
                    http_check(True)
                    engine.recover(backup)
                else:
                    post = attestation(folder / 'operator-postcheck.json', run,
                        ['canonical_domain_verified', 'existing_administrator_session_and_records_verified', 'files_and_anonymous_display_verified'], max_age=300)
                    expected = 'single-club-app' if engine.state()['stage'] == 'verified' else 'recovery-app'
                    core.require(post['candidate'] == expected and post['source_archive_sha256'] == manifest['candidates'][expected]['artifact']['sha256'], 'Destination source/schema mismatch.')
                    http_check(False)
                    if action == 'cancel':
                        core.require(post['candidate'] == 'recovery-app', 'Cancel requires the unchanged old app.')
                        engine.cancel_before_migration(destination_verified=True)
                    else:
                        engine.resume(backup, destination_verified=True)
            elif action != 'status':
                print('알려진 단계만 선택할 수 있습니다. SQL/배포 명령은 입력받지 않습니다.')
                continue
            state = engine.state()
            core.save(folder, 'checkpoint-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.json', state)
            print('확인한 DB 단계: ' + state['stage'], flush=True)
        except Exception as error:
            core.save(folder, 'stopped-' + secrets.token_hex(6) + '.json', {'action': action, 'error_type': type(error).__name__,
                'detail': str(error) if isinstance(error, RuntimeError) else 'See private evidence; no automatic retry.'})
            print('중단했습니다. 자동 재시도·다음 단계·차단 해제를 하지 않습니다. 현재 DB 단계와 증거를 먼저 검토하세요.', flush=True)
            raise RuntimeError('Operational step failed; state retained for review.') from None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--prepare-run', action='store_true', help='Offline only: bind source candidates to a new run')
    mode.add_argument('--inspect', action='store_true', help='Owner terminal, read-only Production inspection')
    mode.add_argument('--session', action='store_true', help='Owner terminal, separately approved operational window only')
    parser.add_argument('--allow-production-writes', action='store_true', help='Explicit mutation capability; never an approval substitute')
    parser.add_argument('--accept-session-logout', action='store_true', help='Owner accepts that maintenance may require users to log in again; data gates stay enabled')
    parser.add_argument('--release-folder', type=Path, default=DEFAULT_RELEASE)
    parser.add_argument('--run-folder', type=Path)
    args = parser.parse_args()
    os.umask(0o077)
    if args.prepare_run:
        core.require(not args.allow_production_writes, 'Offline preparation cannot enable Production writes.')
        print('Offline run prepared. No DB connection or deployment. Folder: ' + str(prepare_run(args.release_folder)))
    elif args.inspect or args.session:
        core.require(args.run_folder is not None, 'An offline-prepared run folder is required.')
        session(args.run_folder, allow_writes=args.allow_production_writes, inspect=args.inspect, accept_session_logout=args.accept_session_logout)
    else:
        core.require(not args.allow_production_writes, 'Choose an explicit session first.')
        print('Preparation only. --prepare-run makes offline files; Production is not contacted. No deployment commands exist.')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('Operator tool stopped: ' + (str(error) if isinstance(error, RuntimeError) else type(error).__name__), file=sys.stderr)
        raise SystemExit(1)
