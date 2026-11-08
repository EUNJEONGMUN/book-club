"""Rehearse migration on a disposable LOCAL restore. Never targets the running app database."""
from pathlib import Path
from urllib.parse import urlparse, unquote
import argparse, subprocess, json, time, hashlib
parser=argparse.ArgumentParser()
parser.add_argument('--backup',required=True)
parser.add_argument('--pdf-url',required=True)
parser.add_argument('--report',required=True)
a=parser.parse_args()
root=Path(__file__).resolve().parents[1]
backup=Path(a.backup).resolve();report=Path(a.report).resolve()
if not backup.is_relative_to(root/'.local-backups') or not report.is_relative_to(root/'.local-backups'):raise SystemExit('Use ignored local backup directory only')
u=urlparse(a.pdf_url)
if u.hostname not in ['127.0.0.1','localhost'] or '/storage/v1/object/public/discussion-files/' not in u.path:raise SystemExit('Local fixture PDF only')
c='supabase_db_book-club';db='book_club_rehearsal_'+str(time.time_ns());created=False
q=lambda s:"'"+s.replace("'","''")+"'"
def execute(text,database=None,check=True):
 r=subprocess.run(['docker','exec','-i',c,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database or db],input=text.encode(),capture_output=True)
 if check and r.returncode:raise RuntimeError(r.stderr.decode()[-2000:])
 return r
def rows(table):return json.loads(execute(f"SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM {table} t").stdout)
def same(x,y):return sorted(json.dumps(t,sort_keys=True) for t in x)==sorted(json.dumps(t,sort_keys=True) for t in y)
def require(ok,label):
 if not ok:raise RuntimeError(label)
 checks.append(label)
def uid(n):return 'f5000000-0000-0000-0000-'+str(n).zfill(12)
checks=[]
try:
 execute('CREATE DATABASE '+db,'postgres');created=True
 with backup.open('rb') as f:
  restored=subprocess.run(['docker','exec','-i',c,'pg_restore','-U','supabase_admin','--exit-on-error','--dbname',db],stdin=f,capture_output=True)
 if restored.returncode:raise RuntimeError(restored.stderr.decode()[-2000:])
 old=(root/'supabase/migrations/20261108000003_single_club_schema.sql').read_text()
 hardening=(root/'supabase/migrations/20261108000004_preserve_history_and_archive.sql').read_text()
 original='10000000-0000-0000-0000-000000000001'
 # Same name with an unverified UUID must never select a different group.
 bad=old.replace(original,uid(99)).replace('7504fd29-94ee-4134-b4f6-d7adb25fb2ac',uid(98))
 r=execute(bad,check=False)
 require(r.returncode!=0 and 'verified retained club UUID' in r.stderr.decode(),'unverified UUID rejected and transaction rolled back')
 # Renaming the verified club does not stop its records from being preserved.
 fixture=f"""
 INSERT INTO auth.users(id,email,aud,role,created_at,updated_at)
 SELECT ('f5000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'rehearsal-'||n||'@local.test','authenticated','authenticated',now(),now() FROM generate_series(1,4) n;
 INSERT INTO auth.identities(user_id,provider_id,identity_data,provider) VALUES('{uid(3)}','rehearsal-google',jsonb_build_object('sub','rehearsal-google','email','rehearsal-3@local.test'),'google');
 INSERT INTO public.profiles(id,display_name) SELECT id,'리허설 사용자 '||email FROM auth.users WHERE email LIKE 'rehearsal-%@local.test';
 INSERT INTO public.club_members(club_id,user_id,role) VALUES ('{original}','{uid(1)}','member'),('{original}','{uid(3)}','pending'),('{original}','{uid(4)}','member');
 UPDATE public.clubs SET name='부글부글 (이름 변경 검증)' WHERE id='{original}';
 INSERT INTO public.meetings(id,club_id,host_id,book_title,book_author,scheduled_at,location_name,discussion_file_url,discussion_file_name) VALUES
 ('{uid(21)}','{original}','{uid(1)}','PDF가 있는 일정','테스트 저자',now()+interval '7 days','검증 장소',{q(a.pdf_url)},'한글 발제 자료.pdf'),
 ('{uid(22)}','{original}','{uid(2)}','탈퇴 발제자의 지난 일정','테스트 저자',now()-interval '7 days','검증 장소',NULL,NULL);
 INSERT INTO public.discussion_questions(meeting_id,order_idx,content) VALUES ('{uid(21)}',0,'**강조**와 한글 질문\n\n> 인용문');
 INSERT INTO public.attendances(meeting_id,user_id,status) VALUES ('{uid(22)}','{uid(1)}','attending'),('{uid(22)}','{uid(2)}','not_attending');
 INSERT INTO public.meeting_reviews(id,meeting_id,user_id,content,visibility) VALUES
 ('{uid(31)}','{uid(22)}','{uid(1)}','공개 평','public'),('{uid(32)}','{uid(22)}','{uid(2)}','비공개 평','private'),('{uid(33)}','{uid(22)}','{uid(4)}','익명 평','anonymous');
 INSERT INTO public.club_invites(token,club_id,created_by,expires_at,revoked_at) VALUES
 ('rehearsal-expired','{original}','{uid(1)}',now()-interval '1 day',NULL),('rehearsal-revoked','{original}','{uid(1)}',now()+interval '1 day',now());
 INSERT INTO storage.objects(bucket_id,name) VALUES('discussion-files',{q(unquote(u.path.split('/discussion-files/',1)[1]))});
 """
 execute(fixture)
 tables=['public.clubs','public.club_members','public.club_invites','public.profiles','public.meetings','public.discussion_questions','public.attendances','public.meeting_reviews','auth.users','auth.identities','storage.objects','storage.buckets']
 before={t:rows(t) for t in tables}
 execute(old);execute(hardening)
 for t in ['clubs','club_members','club_invites']:
  require(same(before['public.'+t],rows('legacy_multiclub.'+t)),'all old '+t+' records archived')
 project=lambda records,exclude:[{k:v for k,v in x.items() if k not in exclude} for x in records]
 require(same(project(before['public.meetings'],['club_id']),rows('public.meetings')),'all meeting IDs and PDF paths preserved')
 require(same(project(before['public.profiles'],['is_admin']),rows('public.profiles')),'all profiles including former member preserved')
 require(same(project([x for x in before['public.club_members'] if x['club_id']==original],['club_id']),rows('public.members')),'pending and active roles and join dates preserved')
 require(same(project([x for x in before['public.club_invites'] if x['club_id']==original],['club_id']),rows('public.invites')),'all invite IDs tokens expiry and revocations preserved')
 for t in ['public.discussion_questions','public.attendances','public.meeting_reviews','auth.users','auth.identities','storage.objects','storage.buckets']:
  require(same(before[t],rows(t)),t+' fully preserved')
 require(rows('public.club_settings')[0]['name']=='부글부글 (이름 변경 검증)','verified UUID preserved renamed club')
 # A member sees public/anonymous but not another author's private review.
 visible=execute(f"BEGIN; SELECT set_config('request.jwt.claim.sub','{uid(1)}',true); SET LOCAL ROLE authenticated; SELECT count(*) FROM public.meeting_reviews WHERE id IN ('{uid(31)}','{uid(32)}','{uid(33)}'); ROLLBACK;").stdout.decode().splitlines()[-1]
 require(visible=='2','review visibility preserved')
 # Delete ONLY a newly created pending fixture account, inside a rolled-back transaction.
 archived=execute(f"BEGIN; DELETE FROM auth.users WHERE id='{uid(3)}'; SELECT count(*) FROM legacy_multiclub.club_members WHERE user_id='{uid(3)}'; ROLLBACK;").stdout.decode().splitlines()[-1]
 require(archived=='1','account deletion cannot cascade into archive')
 require(same(before['auth.users'],rows('auth.users')),'account deletion test rolled back')
 report.write_text(json.dumps({'checks':checks,'passed':len(checks),'representative_reviews':3,'fixture_pdf_url_preserved':True,'temporary_database':db},ensure_ascii=False,indent=2))
 print(json.dumps({'representativeMigrationChecks':len(checks),'passed':True,'report':str(report)},ensure_ascii=False))
finally:
 if created:
  assert db.startswith('book_club_rehearsal_') and db.removeprefix('book_club_rehearsal_').isdigit()
  execute('DROP DATABASE '+db+' WITH (FORCE)','postgres')
