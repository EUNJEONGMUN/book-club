"""Production-shaped cutover stages; caller supplies an explicitly authorized transport.

This module never opens a connection. Backup/restore evidence is tied to the live
run, release and freeze. The unchanged local/hosted rehearsal tools stay restricted.
"""
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import secrets
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
PROJECT = 'chvprcpdfgivnfkgwkem'
CLUB = '7504fd29-94ee-4134-b4f6-d7adb25fb2ac'
SCHEMAS = "'public','auth','storage','supabase_migrations','legacy_multiclub','cutover_failed_public'"
EXCEPTIONS = {'auth.schema_migrations', 'storage.migrations', 'storage.buckets_vectors', 'storage.vector_indexes'}


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


guard = load('operational_guard', 'write-barrier-sql.py')
known = load('operational_known_migrations', 'test-cutover-executor.py').MIGRATIONS


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def ident(value):
    return '"' + value.replace('"', '""') + '"'


def canonical(rows):
    return sorted(json.dumps(row, ensure_ascii=False, sort_keys=True) for row in rows)


def save(folder, name, value):
    data = value if isinstance(value, bytes) else json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2).encode() + b'\n'
    path = folder / name
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with path.open('xb') as output:
        output.write(data)
    path.chmod(0o600)
    return {'path': name, 'bytes': len(data), 'sha256': sha(data)}


def artifact(folder, item):
    relative = Path(item['path'])
    require(not relative.is_absolute() and '..' not in relative.parts, 'Invalid backup path.')
    path = folder / relative
    require(path.is_file() and not path.is_symlink() and path.resolve().is_relative_to(folder.resolve()), 'Missing/unsafe backup artifact.')
    data = path.read_bytes()
    require(len(data) == item['bytes'] and sha(data) == item['sha256'], 'Backup artifact size/hash mismatch.')
    return data


def read_bundle(folder):
    folder = Path(folder).resolve()
    require(folder.is_relative_to(ROOT / '.local-backups'), 'Use private backup folders only.')
    manifest = json.loads((folder / 'manifest.json').read_bytes())
    require(manifest['kind'] == 'cutover-frozen-backup-v1' and manifest['project_ref'] == PROJECT and manifest['club_id'] == CLUB
            and re.fullmatch(r'[a-f0-9]{32}', manifest['run_id']) and re.fullmatch(r'[a-f0-9]{64}', manifest['release_sha256'])
            and manifest['freeze_before'] == manifest['freeze_after'] and manifest['files_read_with_cache_nonce'] is True,
            'Not a complete run-bound frozen backup; online copies cannot be promoted.')
    freeze = manifest['freeze_before']
    require(all(freeze.get(key) == manifest[key] for key in ('project_ref', 'club_id', 'run_id', 'release_sha256'))
            and manifest['connection_kind'] in ('production', 'local-restore')
            and re.fullmatch(r'[a-f0-9]{64}', freeze.get('guards_sha256', ''))
            and datetime.fromisoformat(freeze['frozen_at']).tzinfo is not None, 'Backup freeze identity/time mismatch.')
    names = [entry['path'] for entry in manifest['artifacts']]
    require(len(names) == len(set(names)) and {'database.dump', 'public.dump', 'records.json', 'metadata.json', 'files.json'} <= set(names), 'Incomplete backup artifact set.')
    for entry in manifest['artifacts']:
        artifact(folder, entry)
    files = json.loads((folder / 'files.json').read_bytes())
    records = json.loads((folder / 'records.json').read_bytes())
    objects = records['storage.objects']
    require(len(files) == len(objects) and {f['id'] for f in files} == {o['id'] for o in objects}, 'Storage file coverage mismatch.')
    by_id = {o['id']: o for o in objects}
    for entry in files:
        require(entry['bucket_id'] == by_id[entry['id']]['bucket_id'] and entry['name'] == by_id[entry['id']]['name'], 'Storage file identity mismatch.')
        require(entry['path'] in names, 'File not covered by manifest.')
        artifact(folder, entry)
    return manifest, records


def assert_sql(run_id, release, stages):
    require(re.fullmatch(r'[a-f0-9]{32}', run_id) and re.fullmatch(r'[a-f0-9]{64}', release), 'Invalid run/release identity.')
    return ("DO $$ BEGIN IF current_database()<>'postgres' OR session_user<>'postgres' OR NOT EXISTS(SELECT 1 FROM cutover_control.run "
            "WHERE id=1 AND project_ref=" + literal(PROJECT) + ' AND club_id=' + literal(CLUB) + '::uuid AND run_id=' + literal(run_id)
            + ' AND release_sha256=' + literal(release) + ' AND stage IN (' + ','.join(map(literal, stages)) + ")) THEN RAISE EXCEPTION 'Cutover identity/stage mismatch'; END IF; END $$;\n")


def adapt_guard(action, assertion):
    source = getattr(guard, action)('single_club_rehearsal')
    marker = guard.local_assertion('single_club_rehearsal')
    require(marker in source, 'Guard implementation changed.')
    return source.replace(marker, assertion)


class Engine:
    def __init__(self, connection, folder, run_id, release_sha256):
        require(connection.project_ref == PROJECT and connection.kind in ('production', 'local-restore'), 'Wrong transport profile.')
        assert_sql(run_id, release_sha256, ['prepared'])
        self.c, self.folder, self.run_id, self.release = connection, Path(folder).resolve(), run_id, release_sha256
        require(self.folder.is_relative_to(ROOT / '.local-backups'), 'Private run folder required.')
        self.folder.mkdir(mode=0o700, parents=True, exist_ok=True)

    def sql(self, body, read_only=False, check=True):
        return self.c.sql(body, read_only=read_only, check=check)

    def value(self, body):
        row = json.loads(self.sql('SELECT row_to_json(result) FROM (' + body.strip().removesuffix(';') + ') result;', read_only=True).stdout)
        require(isinstance(row, dict) and len(row) == 1, 'Expected a single operator query value.')
        return next(iter(row.values()))

    def state(self):
        return self.value('SELECT to_jsonb(r) FROM cutover_control.run r WHERE id=1;')

    def assertion(self, stages):
        return assert_sql(self.run_id, self.release, stages)

    def identity(self):
        state = self.value("SELECT jsonb_build_object('database',current_database(),'login',session_user,'superuser',current_setting('is_superuser'),'version',current_setting('server_version_num'));")
        require(state['database'] == 'postgres' and state['login'] == 'postgres' and state['superuser'] == 'off'
                and str(state['version']).startswith('17'), 'Unexpected operator DB/role/version.')
        old = self.value("SELECT to_regclass('public.clubs') IS NOT NULL;")
        if old:
            clubs = self.value('SELECT coalesce(jsonb_agg(id ORDER BY id),\'[]\'::jsonb) FROM public.clubs;')
            require(clubs == [CLUB], 'Original retained club identity mismatch.')
        else:
            require(self.value("SELECT legacy_club_id::text FROM public.club_settings WHERE id=1;") == CLUB, 'Converted club identity mismatch.')

    def snapshot(self):
        tables = self.value("SELECT coalesce(jsonb_agg(jsonb_build_array(schemaname,tablename) ORDER BY schemaname,tablename),'[]'::jsonb) FROM pg_tables WHERE schemaname IN (" + SCHEMAS + ');')
        pieces = ['SELECT ' + literal(s + '.' + t) + " k,coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]'::jsonb) v FROM " + ident(s) + '.' + ident(t) + ' x' for s, t in tables]
        require(pieces, 'No protected records.')
        return self.value('SELECT jsonb_object_agg(k,v) FROM (' + ' UNION ALL '.join(pieces) + ') a;')

    def metadata(self):
        result = self.value("SELECT jsonb_build_object('public_oid','public'::regnamespace::oid,'defaults',(SELECT coalesce(jsonb_agg(jsonb_build_array(pg_get_userbyid(d.defaclrole),n.nspname,d.defaclobjtype,d.defaclacl::text) ORDER BY pg_get_userbyid(d.defaclrole),n.nspname,d.defaclobjtype),'[]'::jsonb) FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE n.nspname='public'),'policies',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY schemaname,tablename,policyname),'[]'::jsonb) FROM pg_policies p WHERE schemaname IN ('public','storage')),'publications',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY pubname,tablename),'[]'::jsonb) FROM pg_publication_tables p WHERE schemaname='public'));")
        result['table_access'] = self.value("SELECT coalesce(jsonb_agg(x ORDER BY x::text),'[]'::jsonb) FROM (SELECT jsonb_build_array(c.relname,pg_get_userbyid(c.relowner),c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(a.grantor),CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable) x FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p')) rights;")
        result['function_access'] = self.value("SELECT coalesce(jsonb_agg(x ORDER BY x::text),'[]'::jsonb) FROM (SELECT jsonb_build_array(p.proname,pg_get_function_identity_arguments(p.oid),pg_get_userbyid(p.proowner),pg_get_userbyid(a.grantor),CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable) x FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.pronamespace='public'::regnamespace) rights;")
        return result

    def initialize(self, prerequisites):
        self.identity()
        require(prerequisites == {'maintenance_verified': True, 'external_operator_and_http_drain_attested': True}, 'Maintenance and external drain prerequisites required.')
        require(self.value("SELECT to_regnamespace('cutover_guard') IS NULL AND to_regnamespace('cutover_control') IS NULL AND to_regnamespace('cutover_failed_public') IS NULL AND to_regnamespace('legacy_multiclub') IS NULL;"), 'Existing cutover/archive state requires review.')
        cross = self.value("SELECT count(*) FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal AND p.pronamespace='public'::regnamespace AND c.relnamespace<>'public'::regnamespace;")
        require(cross == 0, 'Managed triggers depend on public functions; recovery needs explicit rebinding.')
        require(self.value("SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('v','m','f');") == 0, 'Unexpected public views/foreign tables.')
        expected = sorted(p.name.split('_', 1)[0] for p in (ROOT / 'supabase/migrations').glob('*.sql') if p.name.split('_', 1)[0] <= '20261108000001')
        require(self.value("SELECT coalesce(jsonb_agg(version ORDER BY version),'[]'::jsonb) FROM supabase_migrations.schema_migrations;") == expected, 'Unexpected migration baseline; review current history.')
        self.sql("BEGIN; CREATE SCHEMA cutover_control; REVOKE ALL ON SCHEMA cutover_control FROM PUBLIC,anon,authenticated,service_role; "
                 "CREATE TABLE cutover_control.run(id smallint PRIMARY KEY CHECK(id=1),run_id text NOT NULL,project_ref text NOT NULL,club_id uuid NOT NULL,release_sha256 text NOT NULL,stage text NOT NULL,frozen_at timestamptz,backup_sha256 text,restore_sha256 text); "
                 'INSERT INTO cutover_control.run VALUES(1,' + literal(self.run_id) + ',' + literal(PROJECT) + ',' + literal(CLUB) + '::uuid,' + literal(self.release) + ",'prepared',NULL,NULL,NULL); COMMIT;")
        save(self.folder, 'prerequisites.json', {**prerequisites, 'external_drain_is_operator_attestation_not_automatic_http_proof': True})

    def freeze(self):
        assertion = self.assertion(['prepared'])
        source = adapt_guard('install', assertion).replace('COMMIT;', "UPDATE cutover_control.run SET stage='frozen',frozen_at=clock_timestamp(); COMMIT;")
        self.sql(source)
        return self.freeze_state()

    def freeze_state(self):
        self.sql(self.assertion(['frozen', 'backup_verified', 'migrated02', 'migrated03', 'converted', 'verified', 'recovering', 'recovered_verified']), read_only=True)
        function = self.value("SELECT jsonb_build_object('owner',pg_get_userbyid(proowner),'definer',prosecdef,'config',proconfig,'body',prosrc) FROM pg_proc WHERE oid='cutover_guard.reject_writes()'::regprocedure;")
        body = "BEGIN\n IF session_user <> 'postgres' THEN RAISE EXCEPTION USING ERRCODE='PT503', MESSAGE='Temporary write barrier active'; END IF;\n RETURN NULL;\nEND"
        require(function.pop('body', '').strip() == body.strip()
                and function == {'owner': 'postgres', 'definer': True, 'config': ['search_path=pg_catalog']}, 'Invalid guard function.')
        tables = self.value("SELECT coalesce(jsonb_agg(jsonb_build_object('name',n.nspname||'.'||c.relname,'eligible',has_table_privilege('postgres',c.oid,'TRIGGER'),'guarded',EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=c.oid AND t.tgname='cutover_write_barrier' AND t.tgfoid='cutover_guard.reject_writes()'::regprocedure AND t.tgenabled='O' AND t.tgtype=62)) ORDER BY n.nspname,c.relname),'[]'::jsonb) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','storage','legacy_multiclub') AND c.relkind IN ('r','p');")
        require(tables and all(t['guarded'] if t['eligible'] else t['name'] in EXCEPTIONS for t in tables), 'Incomplete/disabled/wrong write guards.')
        require(self.value("SELECT NOT (has_schema_privilege('anon','cutover_guard','USAGE') OR has_schema_privilege('authenticated','cutover_guard','USAGE') OR has_schema_privilege('service_role','cutover_guard','USAGE'));") is True, 'Guard namespace exposed to API roles.')
        require(self.value("SELECT NOT (has_function_privilege('anon','cutover_guard.reject_writes()','EXECUTE') OR has_function_privilege('authenticated','cutover_guard.reject_writes()','EXECUTE') OR has_function_privilege('service_role','cutover_guard.reject_writes()','EXECUTE'));") is True, 'Guard function exposed to API roles.')
        require(self.value('SELECT (SELECT count(*) FROM storage.s3_multipart_uploads)+(SELECT count(*) FROM storage.s3_multipart_uploads_parts)+(SELECT count(*) FROM storage.buckets_vectors)+(SELECT count(*) FROM storage.vector_indexes);') == 0, 'Pending uploads or vectors require explicit drain/review.')
        state = self.state()
        return {k: state[k] for k in ('run_id', 'project_ref', 'club_id', 'release_sha256', 'frozen_at')} | {'guards_sha256': sha(json.dumps(tables, sort_keys=True).encode())}

    def capture(self):
        require(self.state()['stage'] == 'frozen', 'Only the original frozen stage can produce a cutover backup.')
        before = self.freeze_state()
        records, metadata = self.snapshot(), self.metadata()
        folder = self.folder / ('backup-' + secrets.token_hex(8))
        folder.mkdir(mode=0o700)
        artifacts = [save(folder, 'records.json', records), save(folder, 'metadata.json', metadata),
                     save(folder, 'database.dump', self.c.dump(False)), save(folder, 'public.dump', self.c.dump(True))]
        files = []
        for i, obj in enumerate(records['storage.objects']):
            require(not obj['name'].startswith('/') and '..' not in Path(obj['name']).parts, 'Unsupported object path.')
            data = self.c.download(obj)
            size = (obj.get('metadata') or {}).get('size')
            require(size is None or len(data) == int(size), 'Storage byte length mismatch.')
            info = save(folder, f'files/{i:05d}.bin', data)
            artifacts.append(info)
            files.append({**info, 'id': obj['id'], 'bucket_id': obj['bucket_id'], 'name': obj['name']})
        artifacts.append(save(folder, 'files.json', files))
        require(self.snapshot() == records and self.metadata() == metadata, 'Records/policies changed during backup.')
        for obj, info in zip(records['storage.objects'], files):
            require(sha(self.c.download(obj)) == info['sha256'], 'Origin file changed during frozen backup.')
        after = self.freeze_state()
        require(before == after, 'Freeze changed during backup.')
        save(folder, 'manifest.json', {'kind': 'cutover-frozen-backup-v1', 'project_ref': PROJECT, 'club_id': CLUB,
            'run_id': self.run_id, 'release_sha256': self.release, 'connection_kind': self.c.kind,
            'freeze_before': before, 'freeze_after': after, 'artifacts': artifacts, 'files_read_with_cache_nonce': True,
            'created_at': datetime.now(timezone.utc).isoformat(), 'restore_verification_required': True})
        read_bundle(folder)
        return folder

    def approve_backup(self, folder):
        manifest, records = read_bundle(folder)
        self.bind(manifest)
        require(self.state()['stage'] == 'frozen' and self.freeze_state() == manifest['freeze_after'], 'Backup not from the current original freeze.')
        # Always perform the restore in this call; a hand-written/old JSON report cannot unlock SQL.
        verifier = load('operator_live_restore_verifier', 'verify-cutover-backup.py')
        report = verifier.verify(folder)
        report_path = Path(folder) / report['report_path']
        require(report['passed'] is True and report['backup_manifest_sha256'] == sha((Path(folder) / 'manifest.json').read_bytes())
                and report['run_id'] == self.run_id and report['release_sha256'] == self.release and report['network_mode'] == 'none'
                and report['copy_blocks'] > 0 and report['files_verified'] == len(records['storage.objects']), 'Missing/mismatched isolated restore evidence.')
        require(self.snapshot() == records, 'Live rows differ from final backup.')
        for obj, entry in zip(records['storage.objects'], json.loads((Path(folder) / 'files.json').read_bytes())):
            require(sha(self.c.download(obj)) == entry['sha256'], 'Live file differs from restored backup.')
        require(self.metadata() == json.loads((Path(folder) / 'metadata.json').read_bytes())
                and self.freeze_state() == manifest['freeze_after'], 'Freeze/policies changed during isolated restore.')
        self.sql('BEGIN; ' + self.assertion(['frozen']) + 'UPDATE cutover_control.run SET stage=\'backup_verified\',backup_sha256=' + literal(report['backup_manifest_sha256']) + ',restore_sha256=' + literal(sha(report_path.read_bytes())) + '; COMMIT;')

    def bind(self, manifest):
        require(manifest['project_ref'] == PROJECT and manifest['club_id'] == CLUB and manifest['run_id'] == self.run_id
                and manifest['release_sha256'] == self.release and manifest['connection_kind'] == self.c.kind, 'Backup belongs to another run/release/environment.')

    def approved_binding(self, folder):
        manifest, records = read_bundle(folder)
        self.bind(manifest)
        state = self.state()
        require(state['backup_sha256'] == sha((Path(folder) / 'manifest.json').read_bytes()), 'This is not the server-approved backup.')
        require(any(sha(path.read_bytes()) == state['restore_sha256'] for path in Path(folder).glob('restore-report-*.json')), 'Server-bound actual restore evidence missing/changed.')
        return manifest, records

    def migration_sql(self, version):
        require(version in known, 'Unknown migration version.')
        name, expected_sha = known[version]
        body = (ROOT / 'supabase/migrations' / (version + '_' + name + '.sql')).read_text()
        require(sha(body.encode()) == expected_sha, 'Migration changed from rehearsed source.')
        before = {'20261108000002': 'backup_verified', '20261108000003': 'migrated02', '20261108000004': 'migrated03'}[version]
        after = {'20261108000002': 'migrated02', '20261108000003': 'migrated03', '20261108000004': 'converted'}[version]
        source = guard.guard_migration(body, 'single_club_rehearsal').replace(guard.local_assertion('single_club_rehearsal'), self.assertion([before]))
        ledger = 'INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES(' + literal(version) + ',' + literal(name) + ',ARRAY[' + literal(body) + ']::text[]);\n'
        return self._wrap_migration(source, ledger, after, before)

    def _wrap_migration(self, source, ledger, after, before):
        prefix = self.assertion([before]) + "DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM cutover_control.run WHERE id=1 AND backup_sha256 IS NOT NULL AND restore_sha256 IS NOT NULL) THEN RAISE EXCEPTION 'Unverified final backup'; END IF; END $$;\n"
        source = source.replace('BEGIN;', 'BEGIN;\n' + prefix, 1)
        marker = source.rindex('COMMIT;')
        return source[:marker] + ledger + 'UPDATE cutover_control.run SET stage=' + literal(after) + ';\n' + source[marker:]

    def migrate(self, version):
        self.freeze_state()
        self.sql(self.migration_sql(version))
        self.freeze_state()

    def verify_conversion(self, folder):
        manifest, before = self.approved_binding(folder)
        stage = self.state()['stage']
        require(stage in ('converted', 'verified'), 'Conversion not complete.')
        after = self.snapshot()
        for table, rows in before.items():
            if table in ('public.clubs', 'public.club_members', 'public.club_invites'):
                actual = after[table.replace('public.', 'legacy_multiclub.', 1)]
            elif table in ('public.profiles', 'public.meetings'):
                actual = after['legacy_multiclub.' + table.split('.')[1] + '_before_single_club']
            elif table == 'supabase_migrations.schema_migrations':
                actual = [r for r in after[table] if r['version'] not in known]
            else:
                actual = after[table]
            require(canonical(rows) == canonical(actual), 'Conversion lost/changed original rows: ' + table)
        for old, new, excluded in [('club_members', 'members', 'club_id'), ('club_invites', 'invites', 'club_id'), ('profiles', 'profiles', 'is_admin'), ('meetings', 'meetings', 'club_id')]:
            expected = [{k: v for k, v in row.items() if k != excluded} for row in before['public.' + old]]
            require(canonical(expected) == canonical(after['public.' + new]), 'Live data projection mismatch.')
        for obj, entry in zip(before['storage.objects'], json.loads((Path(folder) / 'files.json').read_bytes())):
            require(sha(self.c.download(obj)) == entry['sha256'], 'File changed after conversion.')
        self.freeze_state()
        if stage == 'converted':
            self.sql('BEGIN; ' + self.assertion(['converted']) + "UPDATE cutover_control.run SET stage='verified'; COMMIT;")

    def recover(self, folder):
        manifest, before = self.approved_binding(folder)
        require(self.state()['stage'] in ('migrated02', 'migrated03', 'converted', 'verified'), 'Recovery forbidden at this stage, especially after resume.')
        self.freeze_state()
        failed = self.snapshot()
        save(self.folder, 'failed-records-' + secrets.token_hex(4) + '.json', failed)
        save(self.folder, 'failed-database-' + secrets.token_hex(4) + '.dump', self.c.dump(False))
        sql = self.c.public_restore_sql(artifact(Path(folder), next(a for a in manifest['artifacts'] if a['path'] == 'public.dump')))
        require('CREATE SCHEMA public;' not in sql, 'Public schema must retain its OID/default ACL.')
        sql = re.sub(r'^SET (?:statement_timeout|lock_timeout|idle_in_transaction_session_timeout|transaction_timeout) = 0;\s*', '', sql, flags=re.M)
        metadata = json.loads((Path(folder) / 'metadata.json').read_bytes())
        source_schema = self.c.archive_schema(artifact(Path(folder), next(a for a in manifest['artifacts'] if a['path'] == 'database.dump')))
        storage_policies = ''.join(p for p in re.findall(r'(?ms)^CREATE POLICY .*?;\n', source_schema) if ' ON storage.objects ' in p)
        policy_names = self.value("SELECT coalesce(jsonb_agg(policyname),'[]'::jsonb) FROM pg_policies WHERE schemaname='storage' AND tablename='objects';")
        publications = self.metadata()['publications']
        recovery = "BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';\n" + self.assertion(['migrated02', 'migrated03', 'converted', 'verified']) + """
CREATE SCHEMA cutover_failed_public;
REVOKE ALL ON SCHEMA cutover_failed_public FROM PUBLIC,anon,authenticated,service_role;
DO $move$ DECLARE o record; BEGIN
FOR o IN SELECT relname FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','p') ORDER BY relname LOOP EXECUTE format('ALTER TABLE public.%I SET SCHEMA cutover_failed_public',o.relname); END LOOP;
FOR o IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND prokind='f' LOOP EXECUTE format('ALTER FUNCTION %s SET SCHEMA cutover_failed_public',o.signature); END LOOP;
FOR o IN SELECT typname FROM pg_type WHERE typnamespace='public'::regnamespace AND typtype IN ('e','d') LOOP EXECUTE format('ALTER TYPE public.%I SET SCHEMA cutover_failed_public',o.typname); END LOOP;
FOR o IN SELECT relname FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='S' LOOP EXECUTE format('ALTER SEQUENCE public.%I SET SCHEMA cutover_failed_public',o.relname); END LOOP;
END $move$;
"""
        for item in publications:
            recovery += 'ALTER PUBLICATION ' + ident(item['pubname']) + ' DROP TABLE cutover_failed_public.' + ident(item['tablename']) + ';\n'
        recovery += sql + '\n' + ''.join('DROP POLICY ' + ident(p) + ' ON storage.objects;\n' for p in policy_names) + storage_policies
        recovery += "CREATE TABLE cutover_failed_public.migration_history AS TABLE supabase_migrations.schema_migrations; DELETE FROM supabase_migrations.schema_migrations WHERE version IN ('20261108000002','20261108000003','20261108000004');\n"
        # Preserve failed snapshots independently of live Auth users and original profile cascades.
        recovery += """
DO $fk$ DECLARE k record; BEGIN
FOR k IN SELECT n.nspname,c.relname,x.conname FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_class r ON r.oid=x.confrelid WHERE x.contype='f' AND n.nspname IN ('cutover_failed_public','legacy_multiclub') AND r.relnamespace<>c.relnamespace
LOOP EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I',k.nspname,k.relname,k.conname); END LOOP; END $fk$;
CREATE FUNCTION cutover_failed_public.preserve_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Failed snapshot is read only'; END $$;
REVOKE ALL ON FUNCTION cutover_failed_public.preserve_snapshot() FROM PUBLIC,anon,authenticated,service_role;
DO $protect$ DECLARE t record; BEGIN
FOR t IN SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('cutover_failed_public','legacy_multiclub') LOOP EXECUTE format('CREATE TRIGGER preserve_failed_snapshot BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON %I.%I FOR EACH STATEMENT EXECUTE FUNCTION cutover_failed_public.preserve_snapshot()',t.schemaname,t.tablename); END LOOP;
END $protect$;
""" + adapt_guard('attach', self.assertion(['migrated02', 'migrated03', 'converted', 'verified'])) + "UPDATE cutover_control.run SET stage='recovering'; NOTIFY pgrst,'reload schema'; COMMIT;"
        save(self.folder, 'recovery-' + secrets.token_hex(4) + '.sql', recovery.encode())
        self.sql(recovery)
        recovered = self.snapshot()
        for name, rows in before.items():
            require(canonical(rows) == canonical(recovered[name]), 'Recovery differs from frozen original: ' + name)
        for name, rows in failed.items():
            if name.startswith('public.'):
                require(canonical(rows) == canonical(recovered[name.replace('public.', 'cutover_failed_public.', 1)]), 'Failed rows not retained.')
        require(canonical(failed['supabase_migrations.schema_migrations']) == canonical(recovered['cutover_failed_public.migration_history']), 'Failed ledger not retained.')
        require(self.metadata() == metadata, 'Original schema identity/default ACL/policies/publications not restored.')
        self.freeze_state()
        self.sql('BEGIN; ' + self.assertion(['recovering']) + "UPDATE cutover_control.run SET stage='recovered_verified'; COMMIT;")

    def resume(self, folder, destination_verified=False):
        require(destination_verified is True, 'Domain/app/session read checks require operator verification before reopening writes.')
        stage = self.state()['stage']
        require(stage in ('verified', 'recovered_verified'), 'Cannot resume before conversion/recovery verification.')
        manifest, before = self.approved_binding(folder)
        state = self.state()
        require(state['backup_sha256'] == sha((Path(folder) / 'manifest.json').read_bytes()), 'Verified backup binding changed.')
        if stage == 'verified':
            self.verify_conversion(folder)
        else:
            current = self.snapshot()
            require(all(canonical(rows) == canonical(current[name]) for name, rows in before.items()), 'Recovered original data changed before resume.')
            require(self.metadata() == json.loads((Path(folder) / 'metadata.json').read_bytes()), 'Recovered policies/ACLs changed before resume.')
            for obj, entry in zip(before['storage.objects'], json.loads((Path(folder) / 'files.json').read_bytes())):
                require(sha(self.c.download(obj)) == entry['sha256'], 'Recovered file changed before resume.')
        self.freeze_state()
        source = adapt_guard('remove', self.assertion([stage])).replace('COMMIT;', "UPDATE cutover_control.run SET stage='resumed'; COMMIT;")
        self.sql(source)

    def cancel_before_migration(self, destination_verified=False):
        require(destination_verified is True, 'Original app/domain verification required before cancellation.')
        stage = self.state()['stage']
        require(stage in ('frozen', 'backup_verified'), 'Cancellation is only safe before any migration.')
        self.freeze_state()
        self.identity()
        expected = sorted(p.name.split('_', 1)[0] for p in (ROOT / 'supabase/migrations').glob('*.sql') if p.name.split('_', 1)[0] <= '20261108000001')
        require(self.value("SELECT jsonb_agg(version ORDER BY version) FROM supabase_migrations.schema_migrations;") == expected
                and self.value("SELECT to_regclass('public.clubs') IS NOT NULL AND to_regnamespace('legacy_multiclub') IS NULL;"), 'Schema/history already changed; use verified recovery instead.')
        save(self.folder, 'before-cancel-' + secrets.token_hex(6) + '.json', self.snapshot())
        source = adapt_guard('remove', self.assertion([stage])).replace('COMMIT;', "UPDATE cutover_control.run SET stage='cancelled'; COMMIT;")
        self.sql(source)
