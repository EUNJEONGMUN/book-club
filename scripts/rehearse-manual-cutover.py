#!/usr/bin/env python3
"""Replay owner psql exports and read-only observations only in new offline clones."""
from datetime import datetime,timezone
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import time

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('rehearsed_manual',ROOT/'scripts/manual-cutover.py')
manual=importlib.util.module_from_spec(spec);spec.loader.exec_module(manual)
core=manual.core
BACKUP=ROOT/'.local-backups/manual-rollout-20261110/preflight-db-20261110T123903448256Z'
COPIED=ROOT/'.local-backups/production-readonly-20261109T154650326434Z'
RUN_FOLDER=ROOT/'.local-backups/operation-run-20261109T155238544485Z'


def main():
    os.umask(0o077)
    folder=ROOT/'.local-backups'/('manual-sql-rehearsal-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    folder.mkdir(mode=0o700)
    _,production_run=manual.run_state(RUN_FOLDER)
    archive=(BACKUP/'database.dump').read_bytes();manifest=(BACKUP/'manifest.json').read_bytes()
    core.require(core.sha(archive)==json.loads(manifest)['sha256'],'Preflight archive changed.')
    checks=[];reports=[];active=None
    def check(value,label):
        core.require(value,label);checks.append(label)
    def run(args,data=None,required=True):
        result=subprocess.run(args,input=data,capture_output=True,timeout=180)
        if required and result.returncode:
            core.save(folder,'local-error-'+secrets.token_hex(5)+'.log',result.stderr)
            raise RuntimeError('Offline command failed; private diagnostic saved.')
        return result
    def forbidden(*args,**kwargs):raise RuntimeError('Cloud access is forbidden in manual SQL rehearsal.')
    manual.io.ro.request=forbidden;manual.io.ro.access_token=forbidden
    image=run(['docker','inspect','--format','{{.Config.Image}}','supabase_db_book-club']).stdout.decode().strip()
    core.require(image.startswith('public.ecr.aws/supabase/postgres:17.'),'Expected cached PG17 image.')
    roles=run(['docker','exec','supabase_db_book-club','pg_dumpall','-U','supabase_admin','--roles-only','--no-role-passwords']).stdout
    check(not re.search(rb"\bPASSWORD\s+'",roles,re.I),'password-free local role bootstrap')
    roles=roles.replace(b'CREATE ROLE supabase_admin;\n',b'')
    files={f['id']:f for f in json.loads((COPIED/'storage-manifest.json').read_bytes())}
    local_snapshot=folder/'existing-local-before.json'
    run(['node','scripts/check-local-records.mjs','snapshot',str(local_snapshot)])
    try:
        for scenario in ('cancel','success','recover02','recover03','recover04'):
            print('Manual psql rehearsal: '+scenario+' (network none)',flush=True)
            case=folder/scenario;case.mkdir(mode=0o700)
            local_run={**production_run,'run_id':secrets.token_hex(16)}
            check(local_run['run_id']!=production_run['run_id'],'rehearsal ID cannot target the real run')
            paths=manual.prepare(case,local_run)
            exported={p.name:p for p in paths}
            init="initdb -D /tmp/manual-data -U supabase_admin --auth=trust --encoding=UTF8 --locale=C >/tmp/initdb.log 2>&1 && exec postgres -D /tmp/manual-data -c listen_addresses= -c unix_socket_directories=/tmp -c shared_preload_libraries= -c session_preload_libraries=supautils -c supautils.superuser=supabase_admin -c supautils.privileged_role=supabase_privileged_role -c 'supautils.policy_grants={\"postgres\":[\"storage.objects\"]}'"
            active=run(['docker','run','--detach','--pull','never','--network','none','--name','book-club-manual-'+secrets.token_hex(6),
                '--label','book-club.manual-rehearsal=true','--user','postgres','--tmpfs','/tmp:rw,mode=1777,size=536870912','--entrypoint','/bin/sh',image,'-c',init]).stdout.decode().strip()
            core.require(re.fullmatch(r'[a-f0-9]{64}',active),'Unexpected new container ID.')
            check(run(['docker','inspect','--format','{{.HostConfig.NetworkMode}}',active]).stdout.strip()==b'none','new clone has no external network')
            def sql(body,role='postgres',required=True):
                return run(['docker','exec','-i',active,'psql','-h','/tmp','-U',role,'-d','postgres','-XqAt','-v','ON_ERROR_STOP=1'],body.encode(),required)
            for _ in range(100):
                if run(['docker','exec',active,'pg_isready','-h','/tmp','-U','supabase_admin'],required=False).returncode==0:break
                time.sleep(.2)
            else:raise RuntimeError('New offline DB not ready.')
            sql(roles.decode(),role='supabase_admin')
            run(['docker','exec','-i',active,'pg_restore','-h','/tmp','-U','supabase_admin','-d','postgres','--exit-on-error'],archive)
            sql("ALTER DATABASE postgres OWNER TO postgres; DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='supabase_read_only_user') THEN CREATE ROLE supabase_read_only_user; END IF; END $$; ALTER ROLE supabase_read_only_user LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS; GRANT pg_read_all_data TO supabase_read_only_user;",role='supabase_admin')

            class LocalObserver(manual.Observer):
                kind='local-restore'
                def __init__(self):
                    self.folder,self.run,self.action=case,local_run,'init'
                    self.full=self.public=None
                def query(self,body):
                    core.require(body.startswith('SELECT '),'Read-only clone queries only.')
                    wrapped="BEGIN READ ONLY; SET LOCAL search_path=pg_catalog; SET LOCAL TIME ZONE 'UTC'; SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM ("+body.strip().removesuffix(';')+") q; ROLLBACK;"
                    return json.loads(sql(wrapped,role='supabase_read_only_user').stdout)
                def download(self,obj):
                    item=files[obj['id']]
                    core.require(item['name']==obj['name'] and item['bucket_id']==obj['bucket_id'],'File identity mismatch.')
                    data=(COPIED/item['path']).read_bytes()
                    core.require(core.sha(data)==item['sha256'],'File hash mismatch.')
                    return data
            observer=LocalObserver()
            engine=manual.ObservedEngine(observer,case,local_run['run_id'],local_run['release_sha256']);observer.engine=engine
            before=engine.snapshot();metadata=engine.metadata()
            def stage():return engine.state()['stage']
            def owner(path,required=True):
                body=path.read_text()
                core.require(body.startswith('\\set ON_ERROR_STOP on\n'),'Owner error-stop missing.')
                return sql(body,required=required)
            frozen_body=exported['01-freeze.sql'].read_text()
            denied=sql(frozen_body,role='supabase_read_only_user',required=False)
            check(denied.returncode!=0 and engine.value("SELECT to_regnamespace('cutover_control') IS NULL;") is True,'read-only role cannot initialize/freeze')
            wrong=sql(frozen_body.replace(core.CLUB,'f0000000-0000-0000-0000-000000000000'),required=False)
            check(wrong.returncode!=0 and engine.value("SELECT to_regnamespace('cutover_control') IS NULL;") is True,'wrong club rejected before any DDL')
            injected=sql(frozen_body.replace('COMMIT;','SELECT 1/0; COMMIT;'),required=False)
            check(injected.returncode!=0 and engine.value("SELECT to_regnamespace('cutover_control') IS NULL AND to_regnamespace('cutover_guard') IS NULL;") is True and engine.snapshot()==before,'freeze failure rolls back control, triggers and all data atomically')
            owner(exported['01-freeze.sql'])
            check(stage()=='frozen' and engine.freeze_state()['run_id']==local_run['run_id'],'owner exported SQL freezes exact run; observer verifies real guards')
            if scenario=='cancel':
                owner(exported['cancel-before-migration.sql'])
                check(stage()=='cancelled' and engine.snapshot()==before and engine.metadata()==metadata,'pre-migration cancel keeps every original row and policy')
                reports.append({'scenario':scenario,'stage':stage()})
                run(['docker','rm','--force','--volumes',active]);active=None;continue
            early=owner(exported['20261108000002.sql'],required=False)
            check(early.returncode!=0 and stage()=='frozen' and engine.snapshot()==before,'owner SQL cannot migrate before backup restore approval')
            sql('ALTER TABLE public.profiles DISABLE TRIGGER cutover_write_barrier;')
            disabled=owner(exported['20261108000002.sql'],required=False)
            check(disabled.returncode!=0 and b'Incomplete write barrier coverage' in disabled.stderr,'manual SQL rejects disabled guards before DDL')
            sql('ALTER TABLE public.profiles ENABLE TRIGGER cutover_write_barrier;')
            def save_owner_archives(prefix):
                for public,name in ((False,'database.dump'),(True,'public.dump')):
                    data=run(['docker','exec',active,'pg_dump','-h','/tmp','-U','postgres','-d','postgres','-Fc',*(['--schema=public'] if public else [])]).stdout
                    core.save(case,prefix+'-'+name,data)
                observer.full=case/(prefix+'-database.dump');observer.public=case/(prefix+'-public.dump')
            save_owner_archives('frozen-owner')
            bundle=engine.capture()
            check(core.read_bundle(bundle)[0]['connection_kind']=='local-restore','local evidence remains separate from Production')
            def export_action(name,call):
                observer.action=name
                try:call()
                except manual.SQLReady as ready:return ready.path
                raise RuntimeError('Expected owner SQL export, not a DB mutation.')
            approve=export_action('approve',lambda:engine.approve_backup(bundle))
            check(stage()=='frozen','actual restore verification exports approval without writing DB')
            owner(approve)
            check(stage()=='backup_verified','owner approval binds actual full/public/file restore evidence')
            versions=['20261108000002']
            if scenario in ('recover03','recover04','success'):versions.append('20261108000003')
            if scenario in ('recover04','success'):versions.append('20261108000004')
            for version in versions:
                owner(exported[version+'.sql']);engine.freeze_state()
            if scenario in ('recover04','success'):
                compare=export_action('compare',lambda:engine.verify_conversion(bundle))
                check(stage()=='converted','comparison is read-only until owner confirmation SQL')
                owner(compare);check(stage()=='verified','owner marks original record/file preservation verified')
            if scenario!='success':
                failed=engine.snapshot()
                save_owner_archives('failed-owner')
                recovery=export_action('recover',lambda:engine.recover(bundle))
                check(stage() in ('migrated02','migrated03','verified'),'recovery preparation leaves cloud-shaped DB unchanged')
                owner(recovery)
                check(stage()=='recovering','recovery SQL cannot mark itself verified')
                try:engine.resume(bundle,True)
                except RuntimeError:check(True,'resume refused while recovery unverified')
                else:raise RuntimeError('Unsafe recovery resume accepted.')
                failed_file=max(case.glob('failed-records-*.json'),key=lambda p:p.stat().st_mtime_ns)
                context={'run_id':engine.run_id,'release_sha256':engine.release,'backup_manifest_sha256':core.sha((bundle/'manifest.json').read_bytes()),
                    'failed_records':{'path':failed_file.name,'bytes':failed_file.stat().st_size,'sha256':core.sha(failed_file.read_bytes())}}
                core.save(case,'context.json',context)
                recovered=export_action('check-recovery',lambda:manual.check_recovered(engine,bundle,case/'context.json'))
                owner(recovered)
                check(stage()=='recovered_verified' and all(core.canonical(rows)==core.canonical(engine.snapshot()[name]) for name,rows in before.items()) and engine.metadata()==metadata,'owner recovery verification restores every original row/ACL/policy')
            resume=export_action('resume',lambda:engine.resume(bundle,True))
            check(stage() in ('verified','recovered_verified'),'resume preparation keeps write guards installed')
            owner(resume)
            check(stage()=='resumed','owner resume removes only the temporary guards')
            old=owner(exported['cancel-before-migration.sql'],required=False)
            check(old.returncode!=0,'old pre-migration cancel cannot run after resume')
            reports.append({'scenario':scenario,'run_id':engine.run_id,'stage':stage(),'bundle':str(bundle.relative_to(ROOT))})
            run(['docker','rm','--force','--volumes',active]);active=None
        check((BACKUP/'database.dump').read_bytes()==archive and (BACKUP/'manifest.json').read_bytes()==manifest,'source archive and historical manifest unchanged')
        run(['node','scripts/check-local-records.mjs','compare',str(local_snapshot)])
        check(True,'existing local app DB unchanged')
        core.save(folder,'verification-report.json',{'passed':True,'checks':checks,'scenarios':reports,'production_connection_used':False,'cloud_requests_sent':0,'network_mode':'none','existing_local_database_modified':False})
        print(json.dumps({'passed':True,'checks':len(checks),'scenarios':len(reports),'report':str(folder/'verification-report.json')}),flush=True)
    except Exception as error:
        core.save(folder,'failure.json',{'passed':False,'checks':checks,'error':str(error) if isinstance(error,RuntimeError) else type(error).__name__})
        print('Manual rehearsal stopped; private evidence: '+str(folder),flush=True)
        raise SystemExit(1)
    finally:
        if active:
            owned=run(['docker','inspect','--format','{{index .Config.Labels "book-club.manual-rehearsal"}}',active]).stdout.strip()
            if owned==b'true':run(['docker','rm','--force','--volumes',active])


if __name__=='__main__':main()
