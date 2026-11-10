// Called only by verify-local-service-flow.py --write-barrier-rehearsal.
// All SQL and HTTP targets are disposable containers; this accepts no cloud URL.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';

process.umask(0o077);
const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
assert(path.resolve(cfg.folder).startsWith(path.resolve('.local-backups/local-write-barrier-')));
assert.equal(cfg.database, 'runtime_verified');
assert.equal(new URL(cfg.api).hostname, '127.0.0.1');
for (const cid of [cfg.dbContainer, cfg.transportContainer]) assert.match(cid, /^[a-f0-9]{64}$/);
for (const cid of [cfg.dbContainer, cfg.transportContainer]) {
  const info = JSON.parse(execFileSync('docker', ['inspect', cid]))[0];
  assert.equal(info.Config.Labels['book-club.service-verification'], 'true');
  assert(Object.values(info.NetworkSettings.Ports ?? {}).every(value => value === null));
}
const checks = [], fixtures = [];
const record = name => checks.push(name);
const save = (name, value) => fs.writeFileSync(path.join(cfg.folder, name), JSON.stringify(value, null, 2), { mode: 0o600 });
const sum = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const guardSql = action => execFileSync('python3', ['-B', path.join(cfg.root, 'scripts/write-barrier-sql.py'), action, cfg.database]).toString();
function s3(command, args) {
  const program = "const fs=require('fs'),s=require('@aws-sdk/client-s3'),c=require('crypto'),d=JSON.parse(fs.readFileSync(0,'utf8'));(async()=>{const client=new s.S3Client({endpoint:'http://127.0.0.1:5000/s3',forcePathStyle:true,region:'ap-northeast-2',credentials:d.credentials,maxAttempts:1});if(d.args.Body)d.args.Body=Buffer.from(d.args.Body,'base64');try{const r=await client.send(new s[d.command](d.args));let hash;if(r.Body)hash=c.createHash('sha256').update(Buffer.from(await r.Body.transformToByteArray())).digest('hex');process.stdout.write(JSON.stringify({status:r.$metadata.httpStatusCode,hash,uploadId:r.UploadId,eTag:r.ETag}));}catch(e){process.stdout.write(JSON.stringify({status:e.$metadata?.httpStatusCode??0,name:e.name}));}})().catch(()=>process.exit(1));";
  return JSON.parse(execFileSync('docker', ['exec', '-i', cfg.transportContainer, 'node', '-e', program], {
    input: JSON.stringify({ command, args, credentials: cfg.s3Credentials }), timeout: 20000,
  }).toString());
}
function sql(text, role = 'postgres', database = cfg.database) {
  assert(['postgres', 'supabase_admin'].includes(role));
  assert([cfg.database, 'postgres', 'barrier_backup_restore'].includes(database));
  return execFileSync('docker', ['exec', '-i', cfg.dbContainer, 'psql', '-h', '/tmp', '-U', role, '-d', database, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], { input: text, maxBuffer: 16 * 1024 * 1024 }).toString().trim();
}
function snapshot(database = cfg.database) {
  const names = JSON.parse(sql("SELECT json_agg(json_build_array(schemaname,tablename)) FROM pg_tables WHERE schemaname IN ('auth','public','storage','legacy_multiclub','supabase_migrations');", 'supabase_admin', database));
  const parts = names.map(([schema, table]) => {
    assert.match(schema + '_' + table, /^[a-z_][a-z0-9_]*$/);
    return `SELECT '${schema}.${table}' AS name,coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) AS rows FROM "${schema}"."${table}" t`;
  });
  return JSON.parse(sql(`BEGIN READ ONLY; SELECT jsonb_object_agg(name,rows) FROM (${parts.join(' UNION ALL ')}) x; ROLLBACK;`, 'supabase_admin', database));
}
const canonical = obj => JSON.stringify(Object.entries(obj).sort().map(([name, rows]) => [name, rows.map(row => JSON.stringify(row)).sort()]));
function fileSnapshot() {
  const program = "const fs=require('fs'),c=require('crypto'),out={};function walk(p){for(const e of fs.readdirSync(p,{withFileTypes:true})){const f=p+'/'+e.name;if(e.isDirectory())walk(f);else if(e.isFile())out[f]=c.createHash('sha256').update(fs.readFileSync(f)).digest('hex')}}walk('/mnt');process.stdout.write(JSON.stringify(out));";
  return JSON.parse(execFileSync('docker', ['exec', cfg.transportContainer, 'node', '-e', program]).toString());
}
// Requests stay on the loopback host and Docker's internal network.
const bridgeProgram = `require('readline').createInterface({input:process.stdin}).on('line',async line=>{
 const d=JSON.parse(line);try{const roots={auth:'http://auth:9999',rest:'http://rest:3000',storage:'http://127.0.0.1:5000'};
 if(!roots[d.service])throw Error('service');const r=await fetch(roots[d.service]+d.path,{method:d.method,headers:d.headers,body:['GET','HEAD'].includes(d.method)?undefined:Buffer.from(d.body,'base64'),redirect:'manual'});
 process.stdout.write(JSON.stringify({id:d.id,status:r.status,headers:Object.fromEntries(r.headers),body:Buffer.from(await r.arrayBuffer()).toString('base64')})+'\\n');
 }catch{process.stdout.write(JSON.stringify({id:d.id,status:502,headers:{},body:''})+'\\n')}});`;
const bridge = spawn('docker', ['exec', '-i', cfg.transportContainer, 'node', '-e', bridgeProgram], { stdio: ['pipe', 'pipe', 'pipe'] });
let serial = 0, buffer = '';
const pending = new Map();
bridge.stdout.on('data', chunk => {
  buffer += chunk.toString(); let pos;
  while ((pos = buffer.indexOf('\n')) >= 0) {
    const result = JSON.parse(buffer.slice(0, pos)); buffer = buffer.slice(pos + 1);
    pending.get(result.id)?.(result); pending.delete(result.id);
  }
});
const prefixes = { '/auth/v1': 'auth', '/rest/v1': 'rest', '/storage/v1': 'storage' };
const server = http.createServer(async (req, res) => {
  const prefix = Object.keys(prefixes).find(p => req.url.startsWith(p + '/'));
  if (!prefix) { res.writeHead(404); res.end(); return; }
  const headers = { ...req.headers }; for (const name of ['host', 'connection', 'content-length', 'transfer-encoding', 'accept-encoding']) delete headers[name];
  const chunks = []; for await (const chunk of req) chunks.push(chunk);
  const id = ++serial;
  const result = await new Promise(resolve => { pending.set(id, resolve); bridge.stdin.write(JSON.stringify({ id, service: prefixes[prefix], method: req.method, path: req.url.slice(prefix.length), headers, body: Buffer.concat(chunks).toString('base64') }) + '\n'); });
  for (const [key, value] of Object.entries(result.headers)) if (!['content-length', 'content-encoding', 'transfer-encoding', 'connection'].includes(key)) res.setHeader(key, value);
  res.writeHead(result.status); res.end(Buffer.from(result.body, 'base64'));
});
async function request(route, method = 'GET', body, token = cfg.service, extra = {}) {
  const response = await fetch(cfg.api + route, { method, headers: { apikey: cfg.anon, Authorization: `Bearer ${token}`, ...(body && !Buffer.isBuffer(body) ? { 'Content-Type': 'application/json' } : {}), ...extra }, body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body), redirect: 'manual' });
  const bytes = Buffer.from(await response.arrayBuffer());
  let json; try { json = JSON.parse(bytes.toString()); } catch {}
  return { status: response.status, bytes, json, headers: Object.fromEntries(response.headers) };
}
async function rejected(route, method, body, token, headers) {
  const r = await request(route, method, body, token, headers);
  assert(r.status >= 400 && r.status !== 502, `Write was not rejected by the service: ${method} ${route.split('?')[0]} status ${r.status}`);
  record(`blocked ${method} ${route.split('?')[0]}`);
}
let barrierInstalled = false;
try {
  await new Promise(resolve => server.listen(new URL(cfg.api).port, '127.0.0.1', resolve));
  for (let i = 0; i < 120; i++) {
    try { if ((await request('/auth/v1/health')).status === 200 && (await request('/rest/v1/')).status === 200 && (await request('/storage/v1/status')).status === 200) break; } catch {}
    if (i === 119) throw Error('Local services not ready');
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  for (const role of ['admin', 'member', 'pending', 'none']) {
    const email = `barrier-${role}-${cfg.fixtureSuffix}@example.local`;
    const created = await request('/auth/v1/admin/users', 'POST', { email, password: cfg.password, email_confirm: true, user_metadata: { fixture_run: cfg.fixtureSuffix, fixture_role: role } });
    assert.equal(created.status, 200); fixtures.push({ id: (created.json.user ?? created.json).id, email, role });
  }
  sql(fs.readFileSync(cfg.seedFile, 'utf8'), 'supabase_admin');
  const member = fixtures.find(f => f.role === 'member');
  const session = await request('/auth/v1/token?grant_type=password', 'POST', { email: member.email, password: cfg.password });
  assert.equal(session.status, 200);
  const profilePath = `/rest/v1/profiles?id=eq.${member.id}`;
  assert.equal((await request(profilePath, 'PATCH', { display_name: 'barrier-control' })).status, 204);
  const objectPath = `barrier-${cfg.fixtureSuffix}/canary.pdf`;
  const bucket = 'discussion-files';
  const originalCanary = Buffer.from('%PDF-1.4\nlocal write barrier canary\n%%EOF\n');
  const signedPath = `barrier-${cfg.fixtureSuffix}/signed.pdf`;
  const s3Path = `barrier-${cfg.fixtureSuffix}/s3-canary.pdf`;
  const tusPath = `barrier-${cfg.fixtureSuffix}/tus-canary.pdf`;
  const pendingTusPath = `barrier-${cfg.fixtureSuffix}/pending-tus.pdf`;
  const pendingS3Path = `barrier-${cfg.fixtureSuffix}/pending-s3.pdf`;
  const tusHeaders = name => ({ 'Tus-Resumable': '1.0.0', 'Upload-Length': String(originalCanary.length),
    'Upload-Metadata': Object.entries({ bucketName: bucket, objectName: name, contentType: 'application/pdf' }).map(([k, v]) => `${k} ${Buffer.from(v).toString('base64')}`).join(',') });
  let signed, pendingTusRoute, pendingS3, pendingS3Part;
  if (!cfg.writeBarrierDbOnly) {
    assert.equal((await request(`/storage/v1/object/${bucket}/${objectPath}`, 'POST', originalCanary, cfg.service, { 'Content-Type': 'application/pdf' })).status, 200);
    signed = await request(`/storage/v1/object/upload/sign/${bucket}/${signedPath}`, 'POST', {});
    assert.equal(signed.status, 200); assert(signed.json.token);
    assert.equal(s3('PutObjectCommand', { Bucket: bucket, Key: s3Path, Body: originalCanary.toString('base64'), ContentType: 'application/pdf' }).status, 200);
    assert.equal(s3('GetObjectCommand', { Bucket: bucket, Key: s3Path }).hash, sum(originalCanary));
    const copyControl = `barrier-${cfg.fixtureSuffix}/s3-copy-control.pdf`;
    assert.equal(s3('CopyObjectCommand', { Bucket: bucket, Key: copyControl, CopySource: `${bucket}/${s3Path}` }).status, 200);
    assert.equal(s3('DeleteObjectCommand', { Bucket: bucket, Key: copyControl }).status, 204);
    const multipartKey = `barrier-${cfg.fixtureSuffix}/multipart-control.pdf`;
    const multipart = s3('CreateMultipartUploadCommand', { Bucket: bucket, Key: multipartKey, ContentType: 'application/pdf' });
    assert.equal(multipart.status, 200); assert(multipart.uploadId);
    assert([200, 204].includes(s3('AbortMultipartUploadCommand', { Bucket: bucket, Key: multipartKey, UploadId: multipart.uploadId }).status));
    record('S3 signed request positive controls create/read a synthetic object');
    const tus = await request('/storage/v1/upload/resumable', 'POST', undefined, cfg.service, tusHeaders(tusPath));
    assert.equal(tus.status, 201);
    const location = new URL(tus.headers.location, cfg.api);
    assert(location.pathname.startsWith('/upload/resumable/') || location.pathname.startsWith('/storage/v1/upload/resumable/'));
    const tusRoute = location.pathname.startsWith('/storage/v1/') ? location.pathname : '/storage/v1' + location.pathname;
    const uploaded = await request(tusRoute, 'PATCH', originalCanary, cfg.service, { 'Tus-Resumable': '1.0.0', 'Upload-Offset': '0', 'Content-Type': 'application/offset+octet-stream' });
    assert.equal(uploaded.status, 204);
    assert.equal(sum((await request(`/storage/v1/object/${bucket}/${tusPath}`)).bytes), sum(originalCanary));
    record('TUS resumable create/complete/read positive control succeeds before freeze');
    const pendingTus = await request('/storage/v1/upload/resumable', 'POST', undefined, cfg.service, tusHeaders(pendingTusPath));
    assert.equal(pendingTus.status, 201);
    const pendingLocation = new URL(pendingTus.headers.location, cfg.api);
    assert(pendingLocation.pathname.includes('/upload/resumable/'));
    pendingTusRoute = pendingLocation.pathname.startsWith('/storage/v1/') ? pendingLocation.pathname : '/storage/v1' + pendingLocation.pathname;
    pendingS3 = s3('CreateMultipartUploadCommand', { Bucket: bucket, Key: pendingS3Path, ContentType: 'application/pdf' });
    assert.equal(pendingS3.status, 200); assert(pendingS3.uploadId);
    pendingS3Part = s3('UploadPartCommand', { Bucket: bucket, Key: pendingS3Path, UploadId: pendingS3.uploadId, PartNumber: 1, Body: originalCanary.toString('base64') });
    assert.equal(pendingS3Part.status, 200); assert(pendingS3Part.eTag);
    record('pre-existing TUS and S3 multipart uploads prepared without changing original files');
  }
  const rpc = `CREATE FUNCTION public.barrier_fixture_rpc() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN UPDATE profiles SET display_name='rpc-control' WHERE id='${member.id}'::uuid; RETURN jsonb_build_object('current_user',current_user,'session_user',session_user); END $$; GRANT EXECUTE ON FUNCTION public.barrier_fixture_rpc() TO anon,authenticated,service_role;`;
  sql(rpc + " NOTIFY pgrst, 'reload schema';");
  let rpcControl;
  for (let i = 0; i < 40; i++) {
    rpcControl = await request('/rest/v1/rpc/barrier_fixture_rpc', 'POST', {}, cfg.anon);
    if (rpcControl.status !== 404) break;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  assert.equal(rpcControl.status, 200); assert.deepEqual(rpcControl.json, { current_user: 'postgres', session_user: 'authenticator' });
  record('valid password, privileged REST and security-definer RPC controls succeed before freeze');
  if (!cfg.writeBarrierDbOnly) record('file upload and pre-issued signed upload controls succeed before freeze');
  const role = JSON.parse(sql("SELECT json_build_object('user',session_user,'superuser',(SELECT rolsuper FROM pg_roles WHERE rolname=session_user));"));
  assert.deepEqual(role, { user: 'postgres', superuser: false });
  const tables = JSON.parse(sql("SELECT json_agg(json_build_array(n.nspname,c.relname)) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','storage','legacy_multiclub') AND c.relkind='r' AND has_table_privilege('postgres',c.oid,'TRIGGER');"));
  const triggerBefore = sql("SELECT coalesce(jsonb_agg(jsonb_build_array(t.tgrelid::regclass::text,t.tgname,pg_get_triggerdef(t.oid)) ORDER BY t.oid),'[]'::jsonb) FROM pg_trigger t WHERE NOT t.tgisinternal;");
  const before = snapshot(), filesBefore = fileSnapshot();
  save('barrier-before-records.json', before); save('barrier-before-files.json', filesBefore);
  // Local-only prototype: rejects direct application and managed-service logins,
  // even inside SECURITY DEFINER functions. Only direct postgres is the operator.
  sql(guardSql('install')); barrierInstalled = true;
  assert.equal(sql("SELECT has_schema_privilege('anon','cutover_guard','USAGE') OR has_schema_privilege('authenticated','cutover_guard','USAGE') OR has_schema_privilege('service_role','cutover_guard','USAGE');"), 'f');
  record(`non-superuser postgres installs ${tables.length} statement guards atomically without changing existing roles/policies`);
  assert.equal((await request(profilePath, 'GET', undefined, session.json.access_token)).status, 200);
  assert.equal((await request('/auth/v1/user', 'GET', undefined, session.json.access_token)).status, 200);
  record('existing bearer token Auth user lookup and REST reads remain available');
  for (const file of cfg.files) {
    const r = await request(`/storage/v1/object/${file.bucket_id}/${file.name.split('/').map(encodeURIComponent).join('/')}`);
    assert.equal(r.status, 200); assert.equal(sum(r.bytes), file.sha256);
  }
  record('all 14 original files download with identical bytes while frozen');
  await rejected(profilePath, 'PATCH', { display_name: 'blocked-service' }, cfg.service);
  await rejected(profilePath, 'PATCH', { display_name: 'blocked-member' }, session.json.access_token);
  await rejected('/rest/v1/rpc/barrier_fixture_rpc', 'POST', {}, cfg.anon);
  await rejected('/rest/v1/rpc/barrier_fixture_rpc', 'POST', {}, cfg.service);
  await rejected('/auth/v1/token?grant_type=password', 'POST', { email: member.email, password: cfg.password }, cfg.anon);
  await rejected('/auth/v1/token?grant_type=refresh_token', 'POST', { refresh_token: session.json.refresh_token }, cfg.anon);
  await rejected('/auth/v1/user', 'PUT', { data: { blocked: true } }, session.json.access_token);
  await rejected('/auth/v1/admin/users', 'POST', { email: `blocked-${cfg.fixtureSuffix}@example.local`, password: cfg.password, email_confirm: true }, cfg.service);
  await rejected(`/auth/v1/admin/users/${fixtures.find(f => f.role === 'none').id}`, 'DELETE', undefined, cfg.service);
  if (!cfg.writeBarrierDbOnly) {
    await rejected(`/storage/v1/object/${bucket}/barrier-${cfg.fixtureSuffix}/new.pdf`, 'POST', originalCanary, cfg.service, { 'Content-Type': 'application/pdf' });
    await rejected(`/storage/v1/object/${bucket}/${objectPath}`, 'PUT', Buffer.from('blocked replacement'), cfg.service, { 'Content-Type': 'application/pdf' });
    await rejected(`/storage/v1/object/${bucket}/${objectPath}`, 'POST', Buffer.from('blocked upsert'), cfg.service, { 'Content-Type': 'application/pdf', 'x-upsert': 'true' });
    await rejected(`/storage/v1/object/${bucket}`, 'DELETE', { prefixes: [objectPath] }, cfg.service);
    await rejected(`/storage/v1/object/upload/sign/${bucket}/${signedPath}?token=${encodeURIComponent(signed.json.token)}`, 'PUT', originalCanary, cfg.anon, { 'Content-Type': 'application/pdf' });
    await rejected('/storage/v1/upload/resumable', 'POST', undefined, cfg.service, tusHeaders(`barrier-${cfg.fixtureSuffix}/blocked-tus.pdf`));
    await rejected(pendingTusRoute, 'PATCH', originalCanary, cfg.service, { 'Tus-Resumable': '1.0.0', 'Upload-Offset': '0', 'Content-Type': 'application/offset+octet-stream' });
    for (const [command, args] of [
      ['PutObjectCommand', { Bucket: bucket, Key: `barrier-${cfg.fixtureSuffix}/blocked-s3.pdf`, Body: originalCanary.toString('base64'), ContentType: 'application/pdf' }],
      ['PutObjectCommand', { Bucket: bucket, Key: s3Path, Body: Buffer.from('blocked s3 replacement').toString('base64'), ContentType: 'application/pdf' }],
      ['DeleteObjectCommand', { Bucket: bucket, Key: s3Path }],
      ['CopyObjectCommand', { Bucket: bucket, Key: `barrier-${cfg.fixtureSuffix}/blocked-copy.pdf`, CopySource: `${bucket}/${s3Path}` }],
      ['CreateMultipartUploadCommand', { Bucket: bucket, Key: `barrier-${cfg.fixtureSuffix}/blocked-multipart.pdf`, ContentType: 'application/pdf' }],
      ['UploadPartCommand', { Bucket: bucket, Key: pendingS3Path, UploadId: pendingS3.uploadId, PartNumber: 2, Body: originalCanary.toString('base64') }],
      ['CompleteMultipartUploadCommand', { Bucket: bucket, Key: pendingS3Path, UploadId: pendingS3.uploadId, MultipartUpload: { Parts: [{ PartNumber: 1, ETag: pendingS3Part.eTag }] } }],
      ['AbortMultipartUploadCommand', { Bucket: bucket, Key: pendingS3Path, UploadId: pendingS3.uploadId }],
    ]) {
      const result = s3(command, args);
      assert(result.status >= 400, `S3 command not rejected by service: ${command} status ${result.status}`);
      record('blocked S3 ' + command);
    }
  }
  const afterBlocked = snapshot(), filesAfter = fileSnapshot();
  save('barrier-after-blocked-records.json', afterBlocked); save('barrier-after-blocked-files.json', filesAfter);
  assert.equal(canonical(afterBlocked), canonical(before)); assert.deepEqual(filesAfter, filesBefore);
  record('every DB row and all file-backend bytes remain exact after rejected writes');
  const dump = execFileSync('docker', ['exec', cfg.dbContainer, 'pg_dump', '-h', '/tmp', '-U', 'postgres', '-d', cfg.database, '-Fc'], { maxBuffer: 16 * 1024 * 1024 });
  fs.writeFileSync(path.join(cfg.folder, 'frozen-local-database.dump'), dump, { mode: 0o600 });
  sql('CREATE DATABASE barrier_backup_restore OWNER postgres;', 'supabase_admin', 'postgres');
  execFileSync('docker', ['exec', '-i', cfg.dbContainer, 'pg_restore', '-h', '/tmp', '-U', 'supabase_admin', '-d', 'barrier_backup_restore', '--exit-on-error'], { input: dump });
  assert.equal(canonical(snapshot('barrier_backup_restore')), canonical(before));
  record('operator full DB dump and isolated restore preserve every row while write guards stay enabled');
  sql(guardSql('remove')); barrierInstalled = false;
  assert.equal(sql("SELECT coalesce(jsonb_agg(jsonb_build_array(t.tgrelid::regclass::text,t.tgname,pg_get_triggerdef(t.oid)) ORDER BY t.oid),'[]'::jsonb) FROM pg_trigger t WHERE NOT t.tgisinternal;"), triggerBefore);
  record('removing only the owned guard function removes only its guards; original triggers remain exact');
  assert.equal((await request(profilePath, 'PATCH', { display_name: 'recovered' })).status, 204);
  assert.equal((await request('/auth/v1/token?grant_type=password', 'POST', { email: member.email, password: cfg.password }, cfg.anon)).status, 200);
  assert.equal((await request('/auth/v1/token?grant_type=refresh_token', 'POST', { refresh_token: session.json.refresh_token }, cfg.anon)).status, 200);
  assert.equal((await request(`/auth/v1/admin/users/${fixtures.find(f => f.role === 'none').id}`, 'DELETE')).status, 200);
  record('deletion of only the new disposable Auth fixture succeeds after guard removal');
  if (!cfg.writeBarrierDbOnly) {
    const recovered = Buffer.from('%PDF-1.4\nrecovered local canary\n%%EOF\n');
    assert.equal((await request(`/storage/v1/object/${bucket}/${objectPath}`, 'PUT', recovered, cfg.service, { 'Content-Type': 'application/pdf' })).status, 200);
    assert.equal(sum((await request(`/storage/v1/object/${bucket}/${objectPath}`)).bytes), sum(recovered));
    assert.equal((await request(`/storage/v1/object/${bucket}`, 'DELETE', { prefixes: [objectPath] })).status, 200);
    assert.equal((await request(`/storage/v1/object/upload/sign/${bucket}/${signedPath}?token=${encodeURIComponent(signed.json.token)}`, 'PUT', originalCanary, cfg.anon, { 'Content-Type': 'application/pdf' })).status, 200);
    assert.equal(sum((await request(`/storage/v1/object/${bucket}/${signedPath}`)).bytes), sum(originalCanary));
    assert.equal((await request(`/storage/v1/object/${bucket}`, 'DELETE', { prefixes: [signedPath] })).status, 200);
    record('the same pre-issued signed upload URL succeeds after guard removal');
    assert.equal(s3('PutObjectCommand', { Bucket: bucket, Key: s3Path, Body: recovered.toString('base64'), ContentType: 'application/pdf' }).status, 200);
    assert.equal(s3('GetObjectCommand', { Bucket: bucket, Key: s3Path }).hash, sum(recovered));
    assert.equal(s3('DeleteObjectCommand', { Bucket: bucket, Key: s3Path }).status, 204);
    assert.equal((await request(`/storage/v1/object/${bucket}`, 'DELETE', { prefixes: [tusPath] })).status, 200);
    assert.equal((await request(pendingTusRoute, 'PATCH', originalCanary, cfg.service, { 'Tus-Resumable': '1.0.0', 'Upload-Offset': '0', 'Content-Type': 'application/offset+octet-stream' })).status, 204);
    assert.equal(sum((await request(`/storage/v1/object/${bucket}/${pendingTusPath}`)).bytes), sum(originalCanary));
    assert.equal(s3('CompleteMultipartUploadCommand', { Bucket: bucket, Key: pendingS3Path, UploadId: pendingS3.uploadId, MultipartUpload: { Parts: [{ PartNumber: 1, ETag: pendingS3Part.eTag }] } }).status, 200);
    assert.equal(s3('GetObjectCommand', { Bucket: bucket, Key: pendingS3Path }).hash, sum(originalCanary));
    assert.equal((await request(`/storage/v1/object/${bucket}`, 'DELETE', { prefixes: [pendingTusPath, pendingS3Path] })).status, 200);
    record('S3 writes/read/delete recover after guard removal');
  }
  sql('DROP FUNCTION public.barrier_fixture_rpc();');
  record('Auth sign-in/refresh and privileged REST work again after guard removal');
  if (!cfg.writeBarrierDbOnly) record('file replacement/deletion work again after guard removal');
  save('browser-report.json', { passed: true, fixtureIds: fixtures.map(f => f.id), checks, fileDownloads: cfg.files.length,
    write_barrier: { locally_validated: true, storage_write_flows_tested: !cfg.writeBarrierDbOnly, guarded_tables: tables, full_data_and_bytes_preserved_during_freeze: true,
      frozen_backup_restored: true, original_triggers_preserved: true, production_ready: false,
      pre_existing_tus_and_s3_uploads_paused_and_resumed: !cfg.writeBarrierDbOnly,
      remaining: ['live hosted-version applicability and managed-table coverage',
        'drain HTTP bodies already transferring when guards are committed',
        'stop other tools using the allowed direct postgres operator login'] } });
  console.log(JSON.stringify({ passed: true, checks: checks.length, originalFiles: cfg.files.length }));
} catch (error) {
  save('barrier-runtime-failure.json', { completed_checks: checks, error: error.message, barrier_installed: barrierInstalled });
  throw error;
} finally {
  if (barrierInstalled) {
    try { sql(guardSql('remove')); } catch {}
  }
  bridge.stdin.end(); bridge.kill();
  await new Promise(resolve => server.close(resolve));
}
