"""Explicit Production transport plus local archive extraction; no implicit connection."""
import base64
import json
from pathlib import Path
import secrets
import subprocess
import tempfile
from urllib.parse import quote, urlsplit
import importlib.util

ROOT = Path(__file__).resolve().parents[1]


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / filename)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


core = load('cutover_io_core', 'cutover-engine.py')
dump = load('cutover_io_dump', 'production-db-dump.py')
ro = load('cutover_io_read', 'production-readonly-backup.py')
# Production cluster verified via GET /config/database/pooler on 2026-11-10.
# Preview uses aws-0; it is deliberately a different fixed endpoint.
HOST = 'aws-1-ap-northeast-2.pooler.supabase.com'


class ArchiveTools:
    def archive_schema(self, archive):
        result = subprocess.run(['docker', 'exec', '-i', dump.CONTAINER, 'pg_restore', '--schema-only', '--no-owner', '--no-acl', '--file=-'], input=archive, capture_output=True)
        core.require(result.returncode == 0, 'Archive schema extraction failed.')
        return result.stdout.decode()

    def public_restore_sql(self, archive):
        listing = subprocess.run(['docker', 'exec', '-i', dump.CONTAINER, 'pg_restore', '--list'], input=archive, capture_output=True)
        core.require(listing.returncode == 0, 'Public archive listing failed.')
        listing = b'\n'.join(line for line in listing.stdout.splitlines() if b' DEFAULT ACL ' not in line) + b'\n'
        image = subprocess.run(['docker', 'inspect', '--format', '{{.Config.Image}}', dump.CONTAINER], capture_output=True, check=True).stdout.decode().strip()
        core.require(image.startswith('public.ecr.aws/supabase/postgres:17.'), 'Expected cached PG17 archive tools.')
        with tempfile.TemporaryDirectory(prefix='cutover-public-', dir=ROOT / '.local-backups') as location:
            folder = Path(location)
            core.save(folder, 'public.dump', archive)
            core.save(folder, 'restore.list', listing)
            result = subprocess.run(['docker', 'run', '--rm', '--pull', 'never', '--network', 'none', '--user', '0:0',
                                     '--mount', 'type=bind,src=' + str(folder) + ',dst=/input,readonly', '--entrypoint', 'pg_restore', image,
                                     '--no-owner', '--schema=public', '--use-list=/input/restore.list', '--file=-', '/input/public.dump'], capture_output=True)
        core.require(result.returncode == 0, 'Public recovery SQL extraction failed.')
        return result.stdout.decode()


class ProductionConnection(ArchiveTools):
    project_ref = core.PROJECT
    kind = 'production'

    def __init__(self, password, allow_writes=False):
        core.require(isinstance(password, str) and password, 'Existing DB password required.')
        core.require((ROOT / 'supabase/.temp/project-ref').read_text().strip() == core.PROJECT, 'Linked project identity mismatch.')
        pool = urlsplit((ROOT / 'supabase/.temp/pooler-url').read_text().strip())
        core.require(pool.scheme in ('postgres', 'postgresql') and pool.hostname == HOST and pool.username == 'postgres.' + core.PROJECT
                     and not pool.password and pool.path == '/postgres', 'Unexpected Production pooler metadata.')
        self.payload = dump.connection_input(password)
        self.allow_writes = allow_writes
        self._service = None

    def command(self, program, arguments):
        return dump.docker_command() + [program, '--host', HOST, '--port', '5432', '--username', 'postgres.' + core.PROJECT,
                                       '--dbname', 'postgres', '--no-password', *arguments]

    def sql(self, body, read_only=False, check=True):
        core.require(read_only or self.allow_writes, 'Read-only operator connection cannot mutate.')
        if read_only:
            body = "BEGIN READ ONLY; SET LOCAL search_path=pg_catalog; SET LOCAL TIME ZONE 'UTC';\n" + body + '\nROLLBACK;'
        result = subprocess.run(self.command('psql', ['-XqAt', '-v', 'ON_ERROR_STOP=1']), input=self.payload + body.encode(), capture_output=True, timeout=120)
        if check and result.returncode:
            raise RuntimeError('Operator SQL failed; inspect stage before any retry.')
        return result

    def dump(self, public_only=False):
        result = subprocess.run(self.command('pg_dump', ['-Fc', '--lock-wait-timeout=5s', *(['--schema=public'] if public_only else [])]),
                                input=self.payload, capture_output=True, timeout=300)
        core.require(result.returncode == 0 and result.stdout.startswith(b'PGDMP'), 'Frozen database dump failed.')
        return result.stdout

    def download(self, obj):
        if self._service is None:
            headers = {'Authorization': 'Bearer ' + ro.access_token(), 'Content-Type': 'application/json'}
            base = 'https://api.supabase.com/v1/projects/' + core.PROJECT
            project = json.loads(ro.request(base, headers))
            core.require(project['id'] == core.PROJECT and project['name'] == 'book-club', 'Production API identity mismatch.')
            keys = json.loads(ro.request(base + '/api-keys?reveal=true', headers))
            service = next(k['api_key'] for k in keys if k['name'] == 'service_role')
            part = service.split('.')[1]
            claims = json.loads(base64.urlsafe_b64decode(part + '=' * (-len(part) % 4)))
            core.require(claims.get('ref') == core.PROJECT and claims.get('role') == 'service_role', 'Storage credential project mismatch.')
            self._service = service
        url = 'https://' + core.PROJECT + '.supabase.co/storage/v1/object/' + quote(obj['bucket_id'], safe='') + '/' + quote(obj['name'], safe='/') + '?cacheNonce=' + secrets.token_hex(16)
        return ro.request(url, {'apikey': self._service, 'Authorization': 'Bearer ' + self._service, 'Cache-Control': 'no-cache'})
