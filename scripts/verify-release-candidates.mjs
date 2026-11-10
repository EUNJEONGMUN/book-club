// Build source-only candidates locally using Node 24, synthetic credentials and no cloud CLI.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';

process.umask(0o077);
assert.equal(process.argv.length, 3, 'Pass the private candidate folder only');
assert.equal(process.versions.node.split('.')[0], '24', 'Use the existing Node 24 executable, matching Vercel major');
const root = path.resolve(import.meta.dirname, '..');
const folder = fs.realpathSync(process.argv[2]);
assert.equal(path.dirname(folder), path.join(root, '.local-backups'));
assert(path.basename(folder).startsWith('release-candidates-'));
const manifestPath = path.join(folder, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath));
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
execFileSync('python3', ['-B', path.join(root, 'scripts/prepare-release-candidates.py'), '--verify', folder], { cwd: root });
const beforeManifestHash = hash(fs.readFileSync(manifestPath));
const checks = [], builds = [], backendRequests = [];
let child, trap, log, work;
const record = label => checks.push(label);
async function listen(server) {
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port;
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, 'exit'); child.kill('SIGTERM');
  const timer = setTimeout(() => child?.kill('SIGKILL'), 5000);
  try { await exited; } finally { clearTimeout(timer); }
}
async function finished(process, label) {
  const [code] = await once(process, 'exit');
  assert.equal(code, 0, `${label} failed; private build log retained`);
}
const encode = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
const secret = crypto.randomBytes(32);
function token(role) {
  const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role, sub: '00000000-0000-4000-8000-000000000001', exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  return `${body}.${crypto.createHmac('sha256', secret).update(body).digest('base64url')}`;
}
const cookie = `sb-127-auth-token=base64-${Buffer.from(JSON.stringify({ access_token: token('authenticated'), refresh_token: 'synthetic-only',
  expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: '00000000-0000-4000-8000-000000000001' } })).toString('base64url')}`;
let env, appPort;
async function start(mode) {
  child = spawn(process.execPath, [path.join(work, 'node_modules/next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', String(appPort)],
    { cwd: work, env: { ...env, MAINTENANCE_MODE: mode }, stdio: ['ignore', log, log] });
  for (let i = 0; i < 100; i++) {
    assert.equal(child.exitCode, null, 'Local candidate exited');
    try { const r = await fetch(`http://127.0.0.1:${appPort}/login`, { redirect: 'manual' }); if (r.status === (mode === '1' ? 503 : 200)) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw Error('Local candidate readiness timed out');
}
async function maintenanceChecks(label) {
  const count = backendRequests.length;
  for (const [method, route] of [['GET', '/'], ['GET', '/login'], ['GET', '/more/profile'], ['GET', '/auth/callback?code=synthetic-only'], ['POST', '/api/release-verification']]) {
    const response = await fetch(`http://127.0.0.1:${appPort}${route}`, { method, headers: { Cookie: cookie }, redirect: 'manual' });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('retry-after'), '60');
    record(`${label} maintenance: ${method} ${route.split('?')[0]}`);
  }
  assert.equal(backendRequests.length, count);
  record(label + ' maintenance makes no backend call');
}

try {
  trap = http.createServer((request, response) => {
    backendRequests.push({ method: request.method, path: request.url.split('?')[0] });
    response.writeHead(401, { 'Content-Type': 'application/json' }); response.end('{"error":"synthetic release verification only"}');
  });
  const backendPort = await listen(trap);
  const holder = http.createServer(); appPort = await listen(holder); await new Promise(resolve => holder.close(resolve));
  for (const [name, candidate] of Object.entries(manifest.candidates)) {
    work = path.join(folder, 'build-workspace-' + name);
    assert(!fs.existsSync(work)); fs.mkdirSync(work, { mode: 0o700 });
    log = fs.openSync(path.join(folder, name + '-build.log'), 'wx', 0o600);
    try {
      execFileSync('tar', ['-xzf', path.join(folder, candidate.artifact.path), '-C', work]);
      // A separate APFS copy keeps Turbopack inside its own root and isolates dependency writes.
      execFileSync('/bin/cp', ['-cR', path.join(root, 'node_modules'), path.join(work, 'node_modules')]);
      for (const file of ['package.json', 'pnpm-lock.yaml']) assert.equal(hash(fs.readFileSync(path.join(work, file))), hash(fs.readFileSync(path.join(root, file))));
      env = { PATH: `${path.dirname(process.execPath)}:${process.env.PATH}`, LANG: 'en_US.UTF-8', TMPDIR: process.env.TMPDIR || '/tmp',
        NEXT_TELEMETRY_DISABLED: '1', NODE_OPTIONS: `--require=${path.join(root, 'scripts/local-network-guard.cjs')}`,
        NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${backendPort}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: token('anon'),
        SUPABASE_SERVICE_ROLE_KEY: token('service_role'), RESEND_API_KEY: 're_synthetic_release_only',
        NEXT_PUBLIC_SITE_URL: 'https://example.invalid', MAINTENANCE_MODE: candidate.maintenance_mode };
      console.log('Building local source candidate: ' + name + ' (Node ' + process.versions.node + ')');
      child = spawn(process.execPath, [path.join(work, 'node_modules/next/dist/bin/next'), 'build'], { cwd: work, env, stdio: ['ignore', log, log] });
      await finished(child, name + ' default Next build');
      record(name + ' builds with default Next builder and Node 24');
      for (const item of candidate.files) assert.equal(hash(fs.readFileSync(path.join(work, item.path))), item.sha256, 'Build changed fixed source');
      record(name + ' build preserves every packaged source byte');
      await start(candidate.maintenance_mode);
      if (candidate.maintenance_mode === '1') {
        await maintenanceChecks(name);
      } else {
        const login = await fetch(`http://127.0.0.1:${appPort}/login`, { redirect: 'manual' });
        assert.equal(login.status, 200); assert(!(await login.text()).includes('기존 기록을 안전하게 보존하며 서비스를 점검'));
        record(name + ' maintenance-off login route serves normally');
        const count = backendRequests.length;
        await fetch(`http://127.0.0.1:${appPort}/`, { headers: { Cookie: cookie }, redirect: 'manual' });
        assert(backendRequests.length > count && backendRequests.slice(count).some(r => r.path.startsWith('/auth/v1/')));
        record(name + ' synthetic Auth positive control reaches only loopback receiver');
      }
      await stop();
      if (name === 'single-club-app') {
        await start('1'); await maintenanceChecks(name); await stop();
      }
      builds.push({ name, passed: true, node: process.versions.node, next: JSON.parse(fs.readFileSync(path.join(work, 'node_modules/next/package.json'))).version,
        builder: 'next build (default)', source_archive_sha256: candidate.artifact.sha256, real_credentials_used: false });
    } finally {
      await stop();
      if (log !== undefined) { fs.closeSync(log); log = undefined; }
      assert.equal(path.dirname(work), folder); assert(path.basename(work).startsWith('build-workspace-'));
      fs.rmSync(work, { recursive: true, force: true }); work = undefined;
    }
  }
  execFileSync('python3', ['-B', path.join(root, 'scripts/prepare-release-candidates.py'), '--verify', folder], { cwd: root });
  assert.equal(hash(fs.readFileSync(manifestPath)), beforeManifestHash);
  record('all source archives, original backup/rehearsal evidence and manifest remain unchanged');
  const report = { passed: true, completed_at: new Date().toISOString(), input_manifest_sha256: beforeManifestHash, builds, checks,
    production_database_contacted: false, test_database_contacted: false, real_credentials_used: false,
    node_network_guard: true, backend_requests_are_synthetic_loopback_only: true, deployments_created: 0,
    build_outputs_destroyed_after_checks: true, execution_allowed: false, production_ready: false };
  fs.writeFileSync(path.join(folder, 'candidate-verification.json'), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ passed: true, candidates: builds.length, checks: checks.length, report: path.join(folder, 'candidate-verification.json') }));
} catch (error) {
  fs.writeFileSync(path.join(folder, 'candidate-failure.json'), JSON.stringify({ passed: false, error: String(error), builds, checks }), { flag: 'wx', mode: 0o600 });
  throw error;
} finally {
  await stop();
  if (trap) await new Promise(resolve => trap.close(resolve));
}
