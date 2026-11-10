#!/usr/bin/env python3
"""Prepare owner-executed psql files; cloud DB requests are always read-only.

No password prompt, DB write transport, deployment, credential reset or DB reset.
Generated SQL retains executor postgres/run/release/stage checks. The Management
API observer is a different, inherently read-only role, never the SQL executor.
"""
import argparse
from datetime import datetime, timedelta, timezone
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('manual_operator', ROOT / 'scripts/production-cutover.py')
operator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(operator)
core, io = operator.core, operator.io
STAGES = {'prepared','frozen','backup_verified','migrated02','migrated03','converted','verified','recovering','recovered_verified','resumed','cancelled'}


class SQLReady(Exception):
    def __init__(self, path):
        self.path = path


def run_state(folder):
    folder = Path(folder).resolve()
    core.require(folder.parent == ROOT / '.local-backups' and folder.name.startswith('operation-run-'), 'Unexpected private run folder.')
    run = json.loads((folder / 'run-plan.json').read_bytes())
    _, _, digest = operator.release_state(ROOT / run['release_folder'])
    core.require(run['project_ref'] == core.PROJECT and run['club_id'] == core.CLUB and run['release_sha256'] == digest, 'Run/release mismatch.')
    core.assert_sql(run['run_id'], digest, ['prepared'])
    return folder, run


def history_check():
    versions = sorted(p.name.split('_',1)[0] for p in (ROOT/'supabase/migrations').glob('*.sql') if p.name.split('_',1)[0] <= '20261108000001')
    return "IF (SELECT coalesce(jsonb_agg(version ORDER BY version),'[]'::jsonb) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM " + core.literal(json.dumps(versions)) + "::jsonb THEN RAISE EXCEPTION 'Migration baseline changed'; END IF;\n"


def old_club_check():
    return "IF to_regclass('public.clubs') IS NULL OR (SELECT count(*) FROM public.clubs)<>1 OR NOT EXISTS(SELECT 1 FROM public.clubs WHERE id=" + core.literal(core.CLUB) + "::uuid) THEN RAISE EXCEPTION 'Retained club mismatch'; END IF;\n"


def no_uploads_check():
    return "IF (SELECT count(*) FROM storage.s3_multipart_uploads)+(SELECT count(*) FROM storage.s3_multipart_uploads_parts)+(SELECT count(*) FROM storage.buckets_vectors)+(SELECT count(*) FROM storage.vector_indexes)<>0 THEN RAISE EXCEPTION 'Pending upload/vector data requires review'; END IF;\n"


def guard_check():
    body = "BEGIN\n IF session_user <> 'postgres' THEN RAISE EXCEPTION USING ERRCODE='PT503', MESSAGE='Temporary write barrier active'; END IF;\n RETURN NULL;\nEND"
    exceptions = ','.join(core.literal(s) for s in sorted(core.EXCEPTIONS))
    return """DO $guard_check$ BEGIN
 IF NOT coalesce((SELECT pg_get_userbyid(proowner)='postgres' AND prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] AND btrim(prosrc,chr(32)||chr(9)||chr(10)||chr(13))=btrim("""+core.literal(body)+""",chr(32)||chr(9)||chr(10)||chr(13)) FROM pg_proc WHERE oid=to_regprocedure('cutover_guard.reject_writes()')),false) THEN RAISE EXCEPTION 'Invalid write barrier function'; END IF;
 IF has_schema_privilege('anon','cutover_guard','USAGE') OR has_schema_privilege('authenticated','cutover_guard','USAGE') OR has_schema_privilege('service_role','cutover_guard','USAGE') OR has_function_privilege('anon','cutover_guard.reject_writes()','EXECUTE') OR has_function_privilege('authenticated','cutover_guard.reject_writes()','EXECUTE') OR has_function_privilege('service_role','cutover_guard.reject_writes()','EXECUTE') THEN RAISE EXCEPTION 'Write barrier exposed to API roles'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','storage','legacy_multiclub') AND c.relkind IN ('r','p') AND
 CASE WHEN has_table_privilege('postgres',c.oid,'TRIGGER') THEN NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=c.oid AND t.tgname='cutover_write_barrier' AND t.tgfoid='cutover_guard.reject_writes()'::regprocedure AND t.tgenabled='O' AND t.tgtype=62)
 ELSE n.nspname||'.'||c.relname NOT IN ("""+exceptions+") END) THEN RAISE EXCEPTION 'Incomplete write barrier coverage'; END IF;\n"+no_uploads_check()+"END $guard_check$;\n"


def guarded_sql(body):
    core.require('BEGIN;' in body and 'COMMIT;' in body,'Expected guarded transaction.')
    return body.replace('BEGIN;','BEGIN;\n'+guard_check(),1)


def transaction_body(source):
    source = source.strip()
    core.require(source.startswith('BEGIN;') and source.endswith('COMMIT;'), 'Expected an explicit transaction.')
    return source[len('BEGIN;'):-len('COMMIT;')]


def freeze_sql(run):
    core.assert_sql(run['run_id'],run['release_sha256'],['prepared'])
    init = """BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
DO $identity$ BEGIN
 IF current_database()<>'postgres' OR session_user<>'postgres' OR current_setting('is_superuser')<>'off'
 OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999 THEN RAISE EXCEPTION 'Unexpected executor DB/role/version'; END IF;
 IF to_regnamespace('cutover_control') IS NOT NULL OR to_regnamespace('cutover_guard') IS NOT NULL
 OR to_regnamespace('cutover_failed_public') IS NOT NULL OR to_regnamespace('legacy_multiclub') IS NOT NULL THEN RAISE EXCEPTION 'Existing transition state requires review'; END IF;
""" + old_club_check() + history_check() + no_uploads_check() + """
 IF EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal AND p.pronamespace='public'::regnamespace AND c.relnamespace<>'public'::regnamespace) THEN RAISE EXCEPTION 'Cross-schema public function dependency'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('v','m','f')) THEN RAISE EXCEPTION 'Unexpected public views/foreign tables'; END IF;
END $identity$;
CREATE SCHEMA cutover_control;
REVOKE ALL ON SCHEMA cutover_control FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE cutover_control.run(id smallint PRIMARY KEY CHECK(id=1),run_id text NOT NULL,project_ref text NOT NULL,club_id uuid NOT NULL,release_sha256 text NOT NULL,stage text NOT NULL,frozen_at timestamptz,backup_sha256 text,restore_sha256 text);
"""
    init += 'INSERT INTO cutover_control.run VALUES(1,' + ','.join([core.literal(run['run_id']),core.literal(core.PROJECT),core.literal(core.CLUB)+'::uuid',core.literal(run['release_sha256'])]) + ",'prepared',NULL,NULL,NULL);\n"
    # One transaction: failure cannot leave just a control schema or partial guards.
    init += transaction_body(core.adapt_guard('install',core.assert_sql(run['run_id'],run['release_sha256'],['prepared'])))
    init += "UPDATE cutover_control.run SET stage='frozen',frozen_at=clock_timestamp();\n"+guard_check()+"COMMIT;\n"
    return init


def cancel_sql(run):
    source = core.adapt_guard('remove',core.assert_sql(run['run_id'],run['release_sha256'],['frozen','backup_verified']))
    verify = 'DO $old$ BEGIN\n' + old_club_check() + history_check() + "IF to_regnamespace('legacy_multiclub') IS NOT NULL THEN RAISE EXCEPTION 'Already converted; cancellation forbidden'; END IF; END $old$;\n"
    source = source.replace('BEGIN;', 'BEGIN;\n' + verify, 1)
    return guarded_sql(source.replace('COMMIT;', "UPDATE cutover_control.run SET stage='cancelled'; COMMIT;"))


def export_sql(folder, name, body, expires=False):
    body = body.replace('BEGIN;', "BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';\n",1)
    if expires:
        deadline = (datetime.now(timezone.utc)+timedelta(minutes=15)).isoformat()
        body = body.replace('BEGIN;', "BEGIN; DO $fresh$ BEGIN IF clock_timestamp()>" + core.literal(deadline) + "::timestamptz THEN RAISE EXCEPTION 'Verification expired; rerun read-only checks'; END IF; END $fresh$;\n",1)
    body = '\\set ON_ERROR_STOP on\n' + body
    directory = Path(folder)/'manual-sql'
    directory.mkdir(mode=0o700,exist_ok=True)
    artifact = core.save(directory,name,body.encode())
    core.save(directory,name+'.receipt.json',{'artifact':artifact,'cloud_sql_executed':False,'executor':'owner psql only'})
    return directory/name


def prepare(folder, run):
    result = [export_sql(folder,'01-freeze.sql',freeze_sql(run)),export_sql(folder,'cancel-before-migration.sql',cancel_sql(run))]
    engine = core.Engine.__new__(core.Engine)
    engine.run_id,engine.release = run['run_id'],run['release_sha256']
    for version in sorted(core.known):
        result.append(export_sql(folder,version+'.sql',guarded_sql(engine.migration_sql(version))))
    return result


class Observer(io.ArchiveTools):
    project_ref,kind = core.PROJECT,'production'

    def __init__(self,folder,run,action,full=None,public=None):
        self.folder,self.run,self.action = Path(folder),run,action
        self.full,self.public = full,public
        self._token = io.ro.access_token()
        self.files = io.ProductionConnection.__new__(io.ProductionConnection)
        self.files._service = None
        state = self.query("SELECT current_database() AS db,session_user AS login,current_setting('transaction_read_only') AS read_only")
        core.require(state==[{'db':'postgres','login':'supabase_read_only_user','read_only':'on'}], 'Unexpected read-only observer identity.')

    def query(self,body):
        core.require(body.lstrip().startswith('SELECT '),'Only SELECT is sent to the cloud observer.')
        response = io.ro.request('https://api.supabase.com/v1/projects/'+core.PROJECT+'/database/query',
            {'Authorization':'Bearer '+self._token,'Content-Type':'application/json'},json.dumps({'query':body,'read_only':True}).encode())
        return json.loads(response)

    def sql(self,body,read_only=False,check=True):
        if not read_only:
            # Never send this SQL to any cloud endpoint. The owner runs the file.
            path = export_sql(self.folder,self.action+'-'+secrets.token_hex(5)+'.sql',guarded_sql(body),expires=True)
            raise SQLReady(path)
        if body.startswith('DO $$ BEGIN IF current_database()'):
            match = re.search(r'AND stage IN \(([^)]+)\)',body)
            core.require(match is not None,'Unknown observer assertion.')
            stages = re.findall(r"'([a-z0-9_]+)'",match[1])
            core.require(stages and set(stages)<=STAGES and body==core.assert_sql(self.run['run_id'],self.run['release_sha256'],stages),'Unknown executor assertion.')
            # Observe the same live run/stage, without pretending the observer is
            # the postgres executor. Exported mutations retain the ORIGINAL check.
            query = "SELECT current_database()='postgres' AND EXISTS(SELECT 1 FROM cutover_control.run WHERE id=1 AND project_ref="+core.literal(core.PROJECT)+' AND club_id='+core.literal(core.CLUB)+'::uuid AND run_id='+core.literal(self.run['run_id'])+' AND release_sha256='+core.literal(self.run['release_sha256'])+' AND stage IN ('+','.join(map(core.literal,stages))+')) AS matches'
            core.require(self.query(query)==[{'matches':True}],'Observed run/stage mismatch.')
            return SimpleNamespace(returncode=0,stdout=b'',stderr=b'')
        core.require(body.startswith('SELECT row_to_json(result) FROM (') and body.endswith(') result;'),'Only Engine scalar SELECT queries are observed.')
        rows = self.query(body)
        core.require(len(rows)==1 and set(rows[0])=={'row_to_json'},'Unexpected scalar query response.')
        return SimpleNamespace(returncode=0,stdout=json.dumps(rows[0]['row_to_json']).encode(),stderr=b'')

    def dump(self,public_only=False):
        path = self.public if public_only else self.full
        core.require(path is not None,'Owner full/public pg_dump required first.')
        path = Path(path).resolve()
        core.require(path.is_relative_to(ROOT/'.local-backups') and path.is_file() and not path.is_symlink(),'Unsafe archive path.')
        data = path.read_bytes()
        core.require(data.startswith(b'PGDMP'),'Expected a custom archive.')
        if not public_only:
            archived = archive_control(data)
            live = self.engine.state()
            for key in ('run_id','project_ref','club_id','release_sha256','stage','backup_sha256','restore_sha256'):
                core.require(archived.get(key)==live.get(key),'Archive control state differs from this live run.')
            core.require(datetime.fromisoformat(archived['frozen_at'])==datetime.fromisoformat(live['frozen_at']),'Archive belongs to a different freeze.')
        return data

    def download(self,obj):
        return self.files.download(obj)


class ObservedEngine(core.Engine):
    def identity(self):
        # This is a read-only observer; executor identity is enforced in the SQL.
        core.require(self.value("SELECT current_database()='postgres';") is True,'Unexpected observed database.')
        if self.value("SELECT to_regclass('public.clubs') IS NOT NULL;"):
            core.require(self.value("SELECT jsonb_agg(id ORDER BY id) FROM public.clubs;")==[core.CLUB],'Retained club mismatch.')
        else:
            core.require(self.value("SELECT legacy_club_id::text FROM public.club_settings WHERE id=1;")==core.CLUB,'Converted club mismatch.')


def archive_control(data):
    result = subprocess.run(['docker','exec','-i','supabase_db_book-club','pg_restore','--schema=cutover_control','--data-only','--file=-'],input=data,capture_output=True,timeout=30)
    core.require(result.returncode==0,'Cannot inspect owner archive control row.')
    match = re.search(rb'COPY cutover_control\.run \(([^)]+)\) FROM stdin;\n([^\n]+)\n\\\.\n',result.stdout)
    core.require(match is not None,'Old online archives are not a run-bound frozen backup.')
    columns = match[1].decode().split(', ')
    values = [None if v==r'\N' else v for v in match[2].decode().split('\t')]
    core.require(len(columns)==len(values) and set(columns)=={'id','run_id','project_ref','club_id','release_sha256','stage','frozen_at','backup_sha256','restore_sha256'},'Unexpected archive control structure.')
    return dict(zip(columns,values))


def check_recovered(engine,bundle,context_path):
    core.require(engine.state()['stage']=='recovering','Recovery must be verified before it can resume.')
    context_path = Path(context_path).resolve()
    core.require(context_path.parent==engine.folder and not context_path.is_symlink(),'Unexpected recovery evidence path.')
    context = json.loads(context_path.read_bytes())
    core.require(context['run_id']==engine.run_id and context['release_sha256']==engine.release,'Different recovery run/release.')
    _,original = engine.approved_binding(bundle)
    core.require(context['backup_manifest_sha256']==core.sha((Path(bundle)/'manifest.json').read_bytes()),'Different recovery backup.')
    failed = json.loads(core.artifact(engine.folder,context['failed_records']))
    current = engine.snapshot()
    for name,rows in original.items():
        core.require(core.canonical(rows)==core.canonical(current[name]),'Recovered original rows differ: '+name)
    for name,rows in failed.items():
        if name.startswith('public.'):
            core.require(core.canonical(rows)==core.canonical(current[name.replace('public.','cutover_failed_public.',1)]),'Failed rows were not retained.')
    core.require(core.canonical(failed['supabase_migrations.schema_migrations'])==core.canonical(current['cutover_failed_public.migration_history']),'Failed history was not retained.')
    core.require(engine.metadata()==json.loads((Path(bundle)/'metadata.json').read_bytes()),'Original ACLs/policies/schema identity differ.')
    for obj,entry in zip(original['storage.objects'],json.loads((Path(bundle)/'files.json').read_bytes())):
        core.require(core.sha(engine.c.download(obj))==entry['sha256'],'Recovered file differs.')
    engine.freeze_state()
    engine.sql('BEGIN; '+engine.assertion(['recovering'])+"UPDATE cutover_control.run SET stage='recovered_verified'; COMMIT;")


def execute_observation(folder,run,action,bundle=None,full=None,public=None,destination_verified=False,context=None):
    c = Observer(folder,run,action,full,public)
    engine = ObservedEngine(c,folder,run['run_id'],run['release_sha256'])
    c.engine = engine
    if action=='status':
        engine.identity()
        return {'stage':engine.state()['stage'],'freeze':engine.freeze_state()}
    try:
        if action=='capture':
            core.require(full is not None and public is not None,'Both owner archives are required.')
            return {'bundle':str(engine.capture())}
        if action=='approve-backup':engine.approve_backup(Path(bundle))
        elif action=='compare':engine.verify_conversion(Path(bundle))
        elif action=='check-recovery':check_recovered(engine,Path(bundle),context)
        elif action=='resume':engine.resume(Path(bundle),destination_verified)
        elif action=='cancel':engine.cancel_before_migration(destination_verified)
        elif action=='recover':
            core.require(full is not None,'Owner failed-state full archive required.')
            before = set(folder.glob('failed-records-*.json'))
            try:engine.recover(Path(bundle))
            except SQLReady as ready:
                created = set(folder.glob('failed-records-*.json'))-before
                core.require(len(created)==1,'Missing unique failed-records evidence.')
                failed_path = created.pop()
                core.save(folder,'recovery-context-'+secrets.token_hex(5)+'.json',{'run_id':engine.run_id,'release_sha256':engine.release,'sql_path':str(ready.path.relative_to(ROOT)),
                    'backup_manifest_sha256':core.sha((Path(bundle)/'manifest.json').read_bytes()),'failed_records':{'path':failed_path.name,'bytes':failed_path.stat().st_size,'sha256':core.sha(failed_path.read_bytes())},'failed_full_sha256':core.sha(Path(full).read_bytes())})
                raise
        else:raise RuntimeError('Unknown observation action.')
    except SQLReady as ready:
        return {'owner_sql_ready':str(ready.path),'cloud_database_changed':False}
    return {'no_sql_needed':True,'stage':engine.state()['stage']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run-folder',type=Path)
    parser.add_argument('--prepare',action='store_true')
    parser.add_argument('--observe',choices=['status','capture','approve-backup','compare','resume','cancel','recover','check-recovery'])
    parser.add_argument('--bundle',type=Path)
    parser.add_argument('--full',type=Path)
    parser.add_argument('--public',type=Path)
    parser.add_argument('--context',type=Path)
    parser.add_argument('--destination-verified',action='store_true')
    args = parser.parse_args()
    os.umask(0o077)
    if not args.prepare and args.observe is None:
        print('Offline default. No DB connection or SQL execution.');return
    core.require(args.run_folder is not None and not(args.prepare and args.observe),'Choose offline preparation or read-only observation.')
    folder,run = run_state(args.run_folder)
    if args.prepare:
        result = {'owner_sql_files':[str(p) for p in prepare(folder,run)],'cloud_database_changed':False}
    else:
        result = execute_observation(folder,run,args.observe,args.bundle,args.full,args.public,args.destination_verified,args.context)
    print(json.dumps(result,ensure_ascii=False))


if __name__=='__main__':
    try:main()
    except Exception as error:
        print('Manual preparation stopped: '+(str(error) if isinstance(error,RuntimeError) else type(error).__name__))
        raise SystemExit(1)
