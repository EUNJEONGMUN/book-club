#!/usr/bin/env python3
"""Create source-only release/maintenance/recovery packages offline. Never deploys."""
import argparse
from datetime import datetime, timezone
import gzip
import importlib.util
import io
import json
import os
from pathlib import Path, PurePosixPath
import subprocess
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('release_preparation', ROOT / 'scripts/prepare-single-club-cutover.py')
prep = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prep)
HOSTED = '.local-backups/hosted-cutover-20261109T123702465372Z'
CLEANUP = HOSTED + '/approved-cleanup-20261109T141458306687Z/cleanup-report.json'
HOSTED_COMMIT = 'b971862'
LIVE = {
    'observed_on_kst': '2026-11-09', 'source_commit': prep.OLD_APP,
    'deployment_id': 'dpl_6CfNuZiDymJQPjdqN2Z9KeeG2Zxn',
    'immutable_url': 'https://book-club-foa9xir5g-scone-s-projects.vercel.app',
    'production_domain': 'https://book-club-five-nu.vercel.app',
    'dashboard_url': 'https://vercel.com/scone-s-projects/book-club/6CfNuZiDymJQPjdqN2Z9KeeG2Zxn',
    'status': 'Ready', 'plan': 'Hobby', 'production_branch': 'main',
    'auto_assign_production_domains': True, 'node_major': 24,
    'vercel_authentication': True, 'protection_scope': 'Standard Protection',
    'observation_is_read_only': True, 'recheck_before_deployment': True,
}
SPECS = {
    'maintenance-bridge': {'source': prep.OLD_APP, 'patch': True, 'maintenance_mode': '1', 'database_schema': 'old'},
    'single-club-app': {'source': prep.PREVIEW, 'patch': False, 'maintenance_mode': '0', 'database_schema': 'single-club'},
    'recovery-app': {'source': prep.OLD_APP, 'patch': True, 'maintenance_mode': '0', 'database_schema': 'old'},
}
EXCLUDED_PARTS = {'.git', '.vercel', '.next', '.local-backups', 'node_modules', '__pycache__'}


def allowed_path(name):
    path = PurePosixPath(name)
    prep.require(not path.is_absolute() and '..' not in path.parts, 'Unsafe source path.')
    prep.require(not any(part in EXCLUDED_PARTS or part.startswith('.env') for part in path.parts), 'Credential/build path rejected.')
    return name.startswith(('app/', 'components/', 'lib/', 'public/')) or name in prep.RUNTIME_FILES


def source_files(commit):
    data = prep.git('archive', commit)
    result = {}
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:') as archive:
        for member in archive.getmembers():
            # Ignore repository tooling/docs entirely; only deployment runtime paths enter packages.
            if not (member.name.startswith(('app/', 'components/', 'lib/', 'public/')) or member.name in prep.RUNTIME_FILES):
                continue
            prep.require(allowed_path(member.name), 'Unexpected deployment source path.')
            if member.isdir():
                continue
            prep.require(member.isfile(), 'Source symlink/hardlink not accepted.')
            result[member.name] = archive.extractfile(member).read()
    prep.require('app/layout.tsx' in result and 'package.json' in result and 'pnpm-lock.yaml' in result, 'Incomplete app source.')
    prep.require(json.loads(result['package.json'])['scripts']['build'] == 'next build', 'Unexpected build command.')
    return result


def patched_files(original):
    patch = ROOT / 'scripts/maintenance-bridge.patch'
    with tempfile.TemporaryDirectory(prefix='release-patch-', dir=ROOT / '.local-backups') as location:
        directory = Path(location)
        for name, body in original.items():
            target = directory / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(body)
        for arguments in (['--dry-run'], []):
            result = subprocess.run(['patch', *arguments, '--batch', '-p1', '-i', str(patch)], cwd=directory, capture_output=True)
            prep.require(result.returncode == 0, 'Maintenance patch failed; no package generated.')
        result = {p.relative_to(directory).as_posix(): p.read_bytes() for p in directory.rglob('*') if p.is_file()}
    changed = {name for name in set(original) | set(result) if original.get(name) != result.get(name)}
    prep.require(changed == {'lib/supabase/middleware.ts', 'lib/maintenance.ts'}, 'Patch changed unexpected source files.')
    prep.require(result['lib/maintenance.ts'] == (ROOT / 'lib/maintenance.ts').read_bytes(), 'Maintenance response differs from verified implementation.')
    return result


def archive_bytes(files):
    output = io.BytesIO()
    with gzip.GzipFile(fileobj=output, mode='wb', mtime=0, filename='') as compressed:
        with tarfile.open(fileobj=compressed, mode='w') as archive:
            for name, data in sorted(files.items()):
                prep.require(allowed_path(name), 'Non-runtime file in package.')
                member = tarfile.TarInfo(name)
                member.size, member.mode, member.mtime = len(data), 0o644, 0
                archive.addfile(member, io.BytesIO(data))
    return output.getvalue()


def verify_archive(data, expected):
    found = {}
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
        for member in archive.getmembers():
            prep.require(member.isfile() and allowed_path(member.name) and member.name not in found, 'Unsafe/duplicate package member.')
            body = archive.extractfile(member).read()
            found[member.name] = {'path': member.name, 'bytes': len(body), 'sha256': prep.digest(body)}
    prep.require([found[name] for name in sorted(found)] == expected, 'Package contents differ from fixed source inventory.')


def hosted_evidence():
    report = prep.read_json(HOSTED + '/verification-report.json')
    cleanup = prep.read_json(CLEANUP)
    prep.require(report['passed'] is True and len(report['checks']) == 337 and report['managed_api_barrier_tested'] is True
                 and report['existing_preview_rows_preserved'] is True and report['production_connection_used'] is False, 'Hosted rehearsal evidence mismatch.')
    prep.require(cleanup['deleted_count'] == 6 and cleanup['remaining_approved_targets'] == []
                 and cleanup['existing_preview_rows_unchanged'] is True and cleanup['existing_preview_files_unchanged'] is True
                 and cleanup['production_connection_used'] is False, 'Approved cleanup preservation evidence mismatch.')
    hashes = prep.read_json(HOSTED + '/tested-source-sha256.json')
    for item in hashes:
        prep.require(prep.record(item['path'])['sha256'] == item['sha256']
                     and prep.safe_path(item['path']).read_bytes() == prep.git('show', HOSTED_COMMIT + ':' + item['path']),
                     'Hosted executor differs from tested source.')
    return [prep.record(name) for name in (HOSTED + '/verification-report.json', HOSTED + '/tested-source-sha256.json', CLEANUP)]


def write(folder, name, value):
    data = value if isinstance(value, bytes) else json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True).encode() + b'\n'
    target = folder / name
    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with target.open('xb') as output:
        output.write(data)
    return {'path': name, 'bytes': len(data), 'sha256': prep.digest(data)}


def prepare():
    plan = prep.build_plan()
    evidence = hosted_evidence()
    folder = ROOT / '.local-backups' / ('release-candidates-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    folder.mkdir(mode=0o700)
    write(folder, 'cutover-preparation.json', plan)
    old = source_files(prep.OLD_APP)
    bridge = patched_files(old)
    new = source_files(prep.PREVIEW)
    for name in ('package.json', 'pnpm-lock.yaml'):
        prep.require(old[name] == new[name] == (ROOT / name).read_bytes(), 'Dependency versions differ from verified candidates.')
    baseline = write(folder, 'baseline-source.tar.gz', archive_bytes(old))
    candidates = {}
    for name, spec in SPECS.items():
        files = bridge if spec['patch'] else new
        inventory = [{'path': p, 'bytes': len(data), 'sha256': prep.digest(data)} for p, data in sorted(files.items())]
        data = archive_bytes(files)
        verify_archive(data, inventory)
        artifact = write(folder, 'sources/' + name + '.tar.gz', data)
        candidates[name] = {**spec, 'artifact': artifact, 'files': inventory,
                            'planned_vercel_environment': 'production', 'requires_skip_domain': True,
                            'requires_protected_generated_url': True, 'deployment_created': False,
                            'deployable_build_output_included': False}
    migrations = [write(folder, 'database-migrations/' + name, (ROOT / 'supabase/migrations' / name).read_bytes()) for name in prep.MIGRATIONS]
    manifest = {'kind': 'offline-release-source-candidates-v1', 'created_at': datetime.now(timezone.utc).isoformat(),
                'last_observed_production': LIVE, 'candidates': candidates, 'baseline_source': baseline, 'migrations': migrations,
                'hosted_evidence': evidence, 'execution_allowed': False, 'production_ready': False,
                'production_database_contacted': False, 'deployments_created': 0, 'environment_values_included': False,
                'build_verification_pending': True, 'historical_backups_are_final': False,
                'recovery_requires_restored_old_database': True, 'hobby_arbitrary_historical_rollback_assumed': False}
    write(folder, 'manifest.json', manifest)
    return folder


def verify(folder):
    folder = folder.resolve()
    prep.require(folder.parent == ROOT / '.local-backups' and folder.name.startswith('release-candidates-'), 'Unexpected candidate folder.')
    manifest = json.loads((folder / 'manifest.json').read_bytes())
    prep.require(manifest['kind'] == 'offline-release-source-candidates-v1' and manifest['execution_allowed'] is False
                 and manifest['production_ready'] is False and manifest['last_observed_production'] == LIVE
                 and manifest['environment_values_included'] is False and manifest['deployments_created'] == 0
                 and manifest['recovery_requires_restored_old_database'] is True
                 and manifest['hobby_arbitrary_historical_rollback_assumed'] is False
                 and set(manifest['candidates']) == set(SPECS), 'Candidate manifest differs from reviewed plan.')
    prep.build_plan()
    prep.require(manifest['hosted_evidence'] == hosted_evidence(), 'Rehearsal evidence changed.')
    old = source_files(prep.OLD_APP)
    bridge = patched_files(old)
    for name, expected in SPECS.items():
        candidate = manifest['candidates'][name]
        validate_spec(name, candidate)
        files = bridge if expected['patch'] else source_files(prep.PREVIEW)
        expected_inventory = [{'path': p, 'bytes': len(data), 'sha256': prep.digest(data)} for p, data in sorted(files.items())]
        prep.require(candidate['files'] == expected_inventory, 'Source inventory differs from verified revision.')
        prep.check_record(candidate['artifact'], folder)
        verify_archive(prep.safe_path(candidate['artifact']['path'], folder).read_bytes(), expected_inventory)
    for entry in [manifest['baseline_source'], *manifest['migrations']]:
        prep.check_record(entry, folder)
    prep.require(manifest['baseline_source']['sha256'] == prep.digest(archive_bytes(old)), 'Baseline source changed.')
    prep.require([m['path'] for m in manifest['migrations']] == ['database-migrations/' + name for name in prep.MIGRATIONS], 'Migration order changed.')
    for entry, name in zip(manifest['migrations'], prep.MIGRATIONS):
        prep.require(entry['sha256'] == prep.record('supabase/migrations/' + name)['sha256'], 'Migration content changed.')
    return manifest


def validate_spec(name, candidate):
    prep.require(name in SPECS, 'Unknown candidate.')
    expected = SPECS[name]
    prep.require(all(candidate[k] == v for k, v in expected.items()) and candidate['requires_skip_domain'] is True
                 and candidate['requires_protected_generated_url'] is True and candidate['deployment_created'] is False
                 and candidate['deployable_build_output_included'] is False
                 and candidate['planned_vercel_environment'] == 'production', 'Candidate target/mode safety fields changed.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify', type=Path, metavar='CANDIDATE_FOLDER')
    args = parser.parse_args()
    os.umask(0o077)
    try:
        if args.verify:
            verify(args.verify)
            print('Source packages and original evidence verified. No deployment or DB action.')
        else:
            folder = prepare()
            print('Three source candidates prepared offline. No deployment or DB action.')
            print('Folder: ' + str(folder))
    except (RuntimeError, ValueError, KeyError, TypeError, OSError, tarfile.TarError):
        parser.exit(1, 'Candidate preparation stopped. No deployment or DB action was taken.\n')


if __name__ == '__main__':
    main()
