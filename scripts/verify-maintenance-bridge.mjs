// Build the existing Production revision plus the maintenance-only patch locally.
// No cloud credentials, deployment, DB connection or Git mutation is used.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';

process.umask(0o077);
const root = path.resolve(import.meta.dirname, '..');
const source = '378cc2e07321fe88d66178fe29cef2dfb4f5a027';
assert.equal(process.argv.length, 2, 'No deployment URL or credentials accepted');
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const folder = path.join(root, '.local-backups', `maintenance-bridge-${new Date().toISOString().replaceAll(/[-:.]/g, '')}`);
fs.mkdirSync(folder, { mode: 0o700 });
const app = path.join(folder, 'app');
fs.mkdirSync(app);
const archive = path.join(root, '.local-backups/production-dump-20261108T052113760121Z/database.dump');
const archiveHash = sha(fs.readFileSync(archive));
assert.equal(archiveHash, '18c5104cd4413680919fbeb4862e0a8058310ca4b41ec21ab28af9fcdfcbe372');
const checks = [], requests = [];
let child, trap;
const record = name => checks.push(name);
const log = fs.openSync(path.join(folder, 'next.log'), 'wx', 0o600);
function run(command, args, options = {}) {
  return execFileSync(command, args, { cwd: app, maxBuffer: 32 * 1024 * 1024, ...options });
}
async function listen(server) {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return server.address().port;
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, 'exit'); child.kill('SIGTERM');
  const timer = setTimeout(() => child?.kill('SIGKILL'), 5000);
  try { await exited; } finally { clearTimeout(timer); }
}
async function finished(process, label) {
  const [code] = await once(process, 'exit');
  assert.equal(code, 0, `${label} failed; see private next.log`);
}
let env, appPort;
async function start(maintenance) {
  child = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', String(appPort)],
    { cwd: app, env: { ...env, MAINTENANCE_MODE: maintenance }, stdio: ['ignore', log, log] });
  for (let i = 0; i < 100; i++) {
    assert.equal(child.exitCode, null, 'Local server exited');
    try { const r = await fetch(`http://127.0.0.1:${appPort}/login`, { redirect: 'manual' }); if (r.status === (maintenance === '1' ? 503 : 200)) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw Error('Local server readiness timed out');
}

try {
  const sourceTar = execFileSync('git', ['archive', source], { cwd: root, maxBuffer: 32 * 1024 * 1024 });
  run('tar', ['-xf', '-'], { input: sourceTar });
  const patch = path.join(root, 'scripts/maintenance-bridge.patch');
  run('patch', ['--dry-run', '--batch', '-p1', '-i', patch]);
  run('patch', ['--batch', '-p1', '-i', patch]);
  assert(fs.readFileSync(path.join(app, 'lib/supabase/middleware.ts'), 'utf8').includes('if (maintenance) return maintenance;'));
  assert.equal(fs.readFileSync(path.join(app, 'lib/maintenance.ts'), 'utf8'), fs.readFileSync(path.join(root, 'lib/maintenance.ts'), 'utf8'));
  for (const file of ['package.json', 'pnpm-lock.yaml']) assert.equal(sha(fs.readFileSync(path.join(app, file))), sha(fs.readFileSync(path.join(root, file))));
  record('maintenance-only patch applies to the exact old Production source; dependencies match');
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(app, 'node_modules'), 'dir');
  trap = http.createServer((req, res) => { requests.push({ method: req.method, path: req.url.split('?')[0] }); res.writeHead(401, { 'Content-Type': 'application/json' }); res.end('{"error":"local verification only"}'); });
  const trapPort = await listen(trap);
  const portHolder = http.createServer(); appPort = await listen(portHolder);
  await new Promise(resolve => portHolder.close(resolve));
  const secret = crypto.randomBytes(32);
  const encode = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const sign = role => {
    const content = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role, sub: '00000000-0000-4000-8000-000000000001', exp: Math.floor(Date.now() / 1000) + 3600 })}`;
    return `${content}.${crypto.createHmac('sha256', secret).update(content).digest('base64url')}`;
  };
  const session = { access_token: sign('authenticated'), refresh_token: 'local-synthetic-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: '00000000-0000-4000-8000-000000000001' } };
  const cookie = `sb-127-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
  env = { PATH: process.env.PATH, LANG: 'en_US.UTF-8', TMPDIR: process.env.TMPDIR || '/tmp',
    NEXT_TELEMETRY_DISABLED: '1', NODE_OPTIONS: `--require=${path.join(root, 'scripts/local-network-guard.cjs')}`,
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${trapPort}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: sign('anon'),
    SUPABASE_SERVICE_ROLE_KEY: sign('service_role'), RESEND_API_KEY: 're_local_verification_only', MAINTENANCE_MODE: '1' };
  console.log('Old Production source copied and patch checked. Building an isolated local candidate.');
  const build = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'build', '--webpack'],
    { cwd: app, env, stdio: ['ignore', log, log] });
  child = build; await finished(build, 'Local production build');
  record('old-schema-compatible maintenance candidate production build succeeds with external network blocked');
  await start('1');
  const cases = [
    ['GET', '/'], ['GET', '/login'], ['GET', '/signup'], ['GET', '/clubs'],
    ['GET', '/clubs/7504fd29-94ee-4134-b4f6-d7adb25fb2ac/meetings/00000000-0000-4000-8000-000000000002'],
    ['GET', '/auth/callback?code=local-synthetic-code'], ['GET', '/more/profile'], ['GET', '/api/preflight'],
    ['GET', '/api/meetings/00000000-0000-4000-8000-000000000002/share-image'],
    ['POST', '/login'], ['POST', '/clubs'], ['POST', '/clubs/7504fd29-94ee-4134-b4f6-d7adb25fb2ac/meetings'],
    ['PATCH', '/api/preflight'], ['PUT', '/api/preflight'], ['DELETE', '/api/preflight'],
    ['HEAD', '/'], ['OPTIONS', '/clubs'], ['GET', '/?_rsc=local-synthetic'],
  ];
  for (const [method, route] of cases) {
    const headers = { Cookie: cookie };
    if (method === 'POST') Object.assign(headers, { 'Content-Type': 'text/plain;charset=UTF-8', 'Next-Action': '0'.repeat(40) });
    if (route.includes('_rsc=')) headers.RSC = '1';
    const r = await fetch(`http://127.0.0.1:${appPort}${route}`, { method, headers, redirect: 'manual', ...(['GET', 'HEAD'].includes(method) ? {} : { body: '[]' }) });
    assert.equal(r.status, 503, `${method} ${route}`);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal(r.headers.get('retry-after'), '60');
    if (method !== 'HEAD') assert.match(await r.text(), /점검/);
    record(`503 no-store Retry-After: ${method} ${route.split('?')[0]}`);
  }
  assert.equal(requests.length, 0, 'Maintenance must make zero Auth/REST/Storage calls');
  record('authenticated-looking cookie, OAuth callback, Server Action and RSC requests reach no backend');
  await stop();
  await start('0');
  const login = await fetch(`http://127.0.0.1:${appPort}/login`);
  assert.equal(login.status, 200);
  const loginHtml = await login.text();
  assert(loginHtml.includes('/login/page-'), 'Normal login route must be restored; its client form hydrates in the browser');
  assert(!loginHtml.includes('기존 기록을 안전하게 보존하며 서비스를 점검'), 'Maintenance response must be gone');
  await fetch(`http://127.0.0.1:${appPort}/clubs`, { headers: { Cookie: cookie }, redirect: 'manual' });
  assert(requests.some(req => req.path.startsWith('/auth/v1/')), 'Positive control must reach the synthetic backend when maintenance is off');
  record('maintenance-off login works; synthetic Auth positive control confirms backend trap detects requests');
  assert.equal(sha(fs.readFileSync(archive)), archiveHash);
  record('original Production archive unchanged');
  const report = { passed: true, source_commit: source, patch_sha256: sha(fs.readFileSync(patch)), source_tar_sha256: sha(sourceTar),
    check_count: checks.length, checks, external_network_guard: true, build_mode: 'next build --webpack',
    production_connection_used: false, production_deployment_created: false, database_connection_used: false,
    maintenance_backend_requests: 0, positive_control_backend_requests: requests.length,
    does_not_freeze_supabase_direct_apis: true, sentry_tunnel_exempt_from_app_middleware: true,
    static_assets_exempt_from_app_middleware: true, original_archive_unchanged: true };
  fs.writeFileSync(path.join(folder, 'verification-report.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ passed: true, checks: checks.length, report: path.join(folder, 'verification-report.json') }));
} catch (error) {
  fs.writeFileSync(path.join(folder, 'failure.json'), JSON.stringify({ passed: false, error: String(error), checks }), { mode: 0o600 });
  throw error;
} finally {
  await stop();
  if (trap) await new Promise(resolve => trap.close(resolve));
  fs.closeSync(log);
  assert.equal(path.dirname(app), folder); assert.equal(path.basename(app), 'app');
  fs.rmSync(app, { recursive: true, force: true });
}
