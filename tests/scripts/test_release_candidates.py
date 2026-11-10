"""Source package/environment boundary checks without credentials or network."""
import copy
import importlib.util
import io
from pathlib import Path
import tarfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('release_candidates', ROOT / 'scripts/prepare-release-candidates.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseCandidateGuards(unittest.TestCase):
    def test_secrets_backups_builds_and_traversal_excluded(self):
        for path in ('.env.local', 'app/.env.production', 'public/../.env', '/app/page.tsx',
                     'app/node_modules/key', 'public/.local-backups/data', 'app/.next/server.js'):
            with self.subTest(path=path), self.assertRaises(RuntimeError):
                release.allowed_path(path)
        self.assertFalse(release.allowed_path('scripts/production-db-dump.py'))
        self.assertFalse(release.allowed_path('supabase/migrations/example.sql'))

    def test_archive_is_reproducible_source_only(self):
        files = {'app/page.tsx': b'example', 'package.json': b'{}'}
        first = release.archive_bytes(files)
        self.assertEqual(first, release.archive_bytes(dict(reversed(list(files.items())))))
        expected = [{'path': p, 'bytes': len(v), 'sha256': release.prep.digest(v)} for p, v in sorted(files.items())]
        release.verify_archive(first, expected)
        expected[0]['sha256'] = '0' * 64
        with self.assertRaises(RuntimeError):
            release.verify_archive(first, expected)

    def test_symlink_or_duplicate_archive_member_rejected(self):
        for symlink in (True, False):
            output = io.BytesIO()
            with tarfile.open(fileobj=output, mode='w:gz') as archive:
                member = tarfile.TarInfo('app/page.tsx')
                if symlink:
                    member.type, member.linkname = tarfile.SYMTYPE, '../../private'
                    archive.addfile(member)
                else:
                    archive.addfile(member, io.BytesIO())
                    archive.addfile(member, io.BytesIO())
            with self.subTest(symlink=symlink), self.assertRaises(RuntimeError):
                release.verify_archive(output.getvalue(), [])

    def test_candidate_environment_and_database_mismatch_rejected(self):
        candidate = {**release.SPECS['recovery-app'], 'requires_skip_domain': True, 'requires_protected_generated_url': True,
                     'deployment_created': False, 'planned_vercel_environment': 'production', 'deployable_build_output_included': False}
        release.validate_spec('recovery-app', candidate)
        for change in ({'maintenance_mode': '1'}, {'database_schema': 'single-club'}, {'requires_skip_domain': False},
                       {'requires_protected_generated_url': False}, {'planned_vercel_environment': 'preview'},
                       {'deployable_build_output_included': True}):
            with self.subTest(change=change), self.assertRaises(RuntimeError):
                release.validate_spec('recovery-app', {**copy.deepcopy(candidate), **change})


if __name__ == '__main__':
    unittest.main()
