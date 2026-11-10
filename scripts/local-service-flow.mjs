import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const root = path.resolve('.local-backups');
assert(cfg.folder.startsWith(root + path.sep));
for (const target of [cfg.api, cfg.app]) assert.equal(new URL(target).hostname, '127.0.0.1');
const checks = [];
const blocked = new Set();
const fixtures = [];
let next, browser;
const sum = b => crypto.createHash('sha256').update(b).digest('hex');
const record = name => checks.push(name);
// A persistent stdin/stdout bridge reaches HTTP services inside Docker's
// internal network; the containers expose no ports and cannot reach the cloud.
assert.match(cfg.transportContainer,/^[a-f0-9]{64}$/);
const bridgeProgram = `const readline=require('readline');
readline.createInterface({input:process.stdin}).on('line',async line=>{
 const d=JSON.parse(line);try{
  const roots={auth:'http://auth:9999',rest:'http://rest:3000',storage:'http://127.0.0.1:5000'};
  if(!roots[d.service])throw Error('service');
  const body=['GET','HEAD'].includes(d.method)?undefined:Buffer.from(d.body,'base64');
  const r=await fetch(roots[d.service]+d.path,{method:d.method,headers:d.headers,body,redirect:'manual'});
  process.stdout.write(JSON.stringify({id:d.id,status:r.status,headers:Object.fromEntries(r.headers),body:Buffer.from(await r.arrayBuffer()).toString('base64')})+'\\n');
 }catch{process.stdout.write(JSON.stringify({id:d.id,status:502,headers:{},body:''})+'\\n')}
});`;
const bridge=spawn('docker',['exec','-i',cfg.transportContainer,'node','-e',bridgeProgram],{stdio:['pipe','pipe','pipe']});
const pendingRequests=new Map();let nextRequest=0,bridgeBuffer='';
bridge.stdout.on('data',chunk=>{
  bridgeBuffer+=chunk.toString();let pos;
  while((pos=bridgeBuffer.indexOf('\n'))>=0){const line=bridgeBuffer.slice(0,pos);bridgeBuffer=bridgeBuffer.slice(pos+1);const result=JSON.parse(line);pendingRequests.get(result.id)?.(result);pendingRequests.delete(result.id);}
});
const targets = {'/auth/v1':'auth', '/rest/v1':'rest', '/storage/v1':'storage'};
const server = http.createServer(async (req, res) => {
  const prefix = Object.keys(targets).find(prefix => req.url === prefix || req.url.startsWith(prefix + '/') || req.url.startsWith(prefix + '?'));
  res.setHeader('Access-Control-Allow-Origin', cfg.app);
  res.setHeader('Access-Control-Allow-Headers', 'authorization,apikey,content-type,x-client-info,x-supabase-api-version,range,prefer');
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition,Content-Range,ETag');
  if (req.method === 'OPTIONS') {res.writeHead(204);res.end();return;}
  if (!prefix) {res.writeHead(404);res.end();return;}
  if (req.headers.apikey && ![cfg.anon,cfg.service].includes(req.headers.apikey)) {res.writeHead(403);res.end();return;}
  const headers = {...req.headers};
  for(const key of ['host','connection','transfer-encoding','content-length','accept-encoding'])delete headers[key];
  if (!headers.authorization) headers.authorization = `Bearer ${cfg.anon}`;
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const id=++nextRequest;
  const result=await new Promise(resolve=>{pendingRequests.set(id,resolve);bridge.stdin.write(JSON.stringify({id,service:targets[prefix],method:req.method,path:req.url.slice(prefix.length)||'/',headers,body:Buffer.concat(chunks).toString('base64')})+'\n');});
  for(const [key,value]of Object.entries(result.headers))if(!key.startsWith('access-control-')&&!['content-length','content-encoding','transfer-encoding','connection'].includes(key))res.setHeader(key,value);
  res.writeHead(result.status);res.end(Buffer.from(result.body,'base64'));
});

async function waitFor(url, accepted = r => r.ok) {
  for(let i=0;i<120;i++) {
    try {const r=await fetch(url);if(accepted(r))return;}catch{}
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  throw new Error('Local service readiness timed out');
}

async function context() {
  const ctx = await browser.newContext({viewport:{width:390,height:844},locale:'ko-KR',acceptDownloads:true,serviceWorkers:'block'});
  await ctx.route('**/*',async route=>{
    const req=route.request();const url=new URL(req.url());
    if([new URL(cfg.app).origin,new URL(cfg.api).origin].includes(url.origin)) return route.continue();
    if(url.hostname==='chvprcpdfgivnfkgwkem.supabase.co' && url.pathname.startsWith('/storage/v1/object/') && ['GET','HEAD'].includes(req.method())) {
      const local=await fetch(cfg.api+url.pathname+url.search,{method:req.method()});
      const headers=Object.fromEntries(local.headers);for(const key of ['content-length','content-encoding','transfer-encoding','connection'])delete headers[key];
      return route.fulfill({status:local.status,headers,body:Buffer.from(await local.arrayBuffer())});
    }
    blocked.add(url.hostname);return route.abort();
  });
  return ctx;
}

async function login(page, fixture, destination='/') {
  await page.goto(cfg.app+'/login');
  await page.getByLabel('이메일').fill(fixture.email);
  await page.getByLabel('비밀번호').fill(cfg.password);
  await page.getByRole('button',{name:'로그인',exact:true}).click();
  await expect(page).toHaveURL(cfg.app+destination,{timeout:60000});
}

try {
  await new Promise(resolve=>server.listen(new URL(cfg.api).port,'127.0.0.1',resolve));
  await waitFor(cfg.api+'/auth/v1/health');
  await waitFor(cfg.api+'/rest/v1/',r=>[200,401].includes(r.status));
  for(const role of ['admin','member','pending','none']) {
    const email=`flow-${role}-${cfg.fixtureSuffix}@example.local`;
    const response=await fetch(cfg.api+'/auth/v1/admin/users',{method:'POST',headers:{apikey:cfg.service,Authorization:`Bearer ${cfg.service}`,'Content-Type':'application/json'},body:JSON.stringify({email,password:cfg.password,email_confirm:true,user_metadata:{fixture_run:cfg.fixtureSuffix,fixture_role:role}})});
    assert.equal(response.status,200,'Local Auth fixture creation failed');
    const data=await response.json();fixtures.push({id:(data.user??data).id,email,role});
  }
  assert.match(cfg.dbContainer,/^[a-f0-9]{64}$/);
  execFileSync('docker',['exec','-i',cfg.dbContainer,'psql','-h','/tmp','-U','supabase_admin','-d',cfg.database,'-X','-q','-v','ON_ERROR_STOP=1'],{input:fs.readFileSync(cfg.seedFile),stdio:['pipe','pipe','pipe']});
  record('four temporary Auth accounts created without modifying original accounts');
  const sample=fixtures.find(f=>f.role==='member');
  const signed=await fetch(cfg.api+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:cfg.anon,'Content-Type':'application/json'},body:JSON.stringify({email:sample.email,password:cfg.password})});
  assert.equal(signed.status,200);const session=await signed.json();
  const refreshed=await fetch(cfg.api+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:cfg.anon,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})});
  assert.equal(refreshed.status,200);const newSession=await refreshed.json();assert(newSession.access_token);
  const who=await fetch(cfg.api+'/auth/v1/user',{headers:{apikey:cfg.anon,Authorization:`Bearer ${newSession.access_token}`}});
  assert.equal(who.status,200);assert.equal((await who.json()).id,sample.id);
  record('real Auth refresh-token flow issues a valid session for the same local fixture user');
  for(const file of cfg.files) {
    const url=cfg.api+'/storage/v1/object/'+encodeURIComponent(file.bucket_id)+'/'+file.name.split('/').map(encodeURIComponent).join('/');
    const r=await fetch(url,{headers:{apikey:cfg.service,Authorization:`Bearer ${cfg.service}`}});
    assert.equal(r.status,200,'Restored file HTTP download failed');
    assert.equal(sum(Buffer.from(await r.arrayBuffer())),file.sha256);
  }
  record('all fourteen restored files downloaded through real Storage HTTP with matching bytes');
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>['PATH','HOME','TMPDIR','LANG','USER','SHELL'].includes(k)));
  Object.assign(env,{NODE_ENV:'development',NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SUPABASE_URL:cfg.api,NEXT_PUBLIC_SUPABASE_ANON_KEY:cfg.anon,SUPABASE_SERVICE_ROLE_KEY:cfg.service,NEXT_PUBLIC_SITE_URL:cfg.app,MAINTENANCE_MODE:'0',NODE_OPTIONS:`--require=${path.join(cfg.root,'scripts/local-network-guard.cjs')}`});
  const log=fs.openSync(path.join(cfg.folder,'next-app.log'),'a',0o600);
  next=spawn(process.execPath,[path.join(cfg.root,'node_modules/next/dist/bin/next'),'dev','--webpack','--hostname','127.0.0.1','--port',new URL(cfg.app).port],{cwd:cfg.appDir,env,stdio:['ignore',log,log],detached:true});
  fs.closeSync(log);
  await waitFor(cfg.app+'/login');
  browser=await chromium.launch({args:['--disable-background-networking','--disable-component-update','--disable-sync']});
  const member=fixtures.find(f=>f.role==='member');
  const ctx=await context();const page=await ctx.newPage();
  const meetingFiles=cfg.meetings.filter(m=>m.discussion_file_url);
  assert.equal(meetingFiles.length,6);
  await page.goto(cfg.app+'/meetings/'+meetingFiles[0].id);
  await expect(page).toHaveURL(/\/login\?next=/,{timeout:60000});
  await page.getByLabel('이메일').fill(member.email);
  await page.getByLabel('비밀번호').fill('intentionally-wrong-local-password');
  const denied=page.waitForResponse(r=>r.url().includes('/auth/v1/token')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'로그인',exact:true}).click();assert.equal((await denied).status(),400);
  await expect(page).toHaveURL(/\/login\?next=/);record('wrong password rejected and protected detail not displayed');
  await page.getByLabel('비밀번호').fill(cfg.password);
  await page.getByRole('button',{name:'로그인',exact:true}).click();
  await expect(page).toHaveURL(cfg.app+'/meetings/'+meetingFiles[0].id,{timeout:60000});
  record('real email/password login returns to original protected meeting link');
  let downloads=0;
  for(const [i,meeting] of meetingFiles.entries()) {
    await page.goto(cfg.app+'/meetings/'+meeting.id);
    await expect(page.getByRole('heading',{level:1})).toHaveText(meeting.book_title,{timeout:60000});
    const link=page.locator('a').filter({hasText:meeting.discussion_file_name}).first();
    const href=await link.getAttribute('href');assert.equal(new URL(href).hostname,'chvprcpdfgivnfkgwkem.supabase.co');
    const match=new URL(href).pathname.match(/\/object\/public\/([^/]+)\/(.*)$/);assert(match);
    const file=cfg.files.find(f=>f.bucket_id===decodeURIComponent(match[1])&&f.name===decodeURIComponent(match[2]));assert(file);
    const pending=page.waitForEvent('download',{timeout:60000});await link.click();const download=await pending;
    assert.equal(sum(fs.readFileSync(await download.path())),file.sha256);
    assert.equal(download.suggestedFilename().normalize('NFC'),meeting.discussion_file_name.normalize('NFC'));
    downloads++;record(`original meeting ${i+1} download click preserves file bytes and filename`);
  }
  await page.reload();await expect(page.getByRole('heading',{level:1})).toBeVisible();record('session survives a browser page reload');
  await page.goto(cfg.app+'/clubs/'+cfg.club+'/meetings/'+meetingFiles[0].id);
  await expect(page).toHaveURL(cfg.app+'/meetings/'+meetingFiles[0].id);record('old group URL redirects to original meeting ID');
  await page.goto(cfg.app+'/more');await page.getByRole('button',{name:'로그아웃',exact:true}).click();
  await expect(page).toHaveURL(cfg.app+'/login',{timeout:60000});
  await page.goto(cfg.app+'/meetings/'+meetingFiles[0].id);await expect(page).toHaveURL(/\/login\?next=/);
  record('logout clears session and protected page requires login again');
  await ctx.close();
  for(const [role,destination] of [['admin','/'],['pending','/pending'],['none','/onboarding']]) {
    const c=await context();const p=await c.newPage();await login(p,fixtures.find(f=>f.role===role),destination);
    if(role!=='admin'){await p.goto(cfg.app+'/meetings/'+meetingFiles[0].id);await expect(p).toHaveURL(cfg.app+destination);}
    record(`${role} account follows the correct membership access route`);await c.close();
  }
  assert(!blocked.has('chvprcpdfgivnfkgwkem.supabase.co'),'Unexpected hosted Auth/REST attempt');
  record('hosted DB/Auth/REST requests were never allowed');
  fs.writeFileSync(path.join(cfg.folder,'browser-report.json'),JSON.stringify({passed:true,checks,fixtureIds:fixtures.map(f=>f.id),fileDownloads:downloads,blockedHosts:[...blocked],externalOAuthTested:false},null,2),{mode:0o600});
} catch(error) {
  fs.writeFileSync(path.join(cfg.folder,'browser-error.log'),String(error?.stack??error),{mode:0o600});
  process.exitCode=1;
} finally {
  if(browser)await browser.close();
  if(next?.pid){try{process.kill(-next.pid,'SIGTERM');}catch{}}
  bridge.stdin.end();bridge.kill('SIGTERM');
  server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve));
}
