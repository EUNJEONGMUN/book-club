// Diagnose the installed SDK against the statuses observed in the hosted freeze test.
// All fetch responses are synthetic/in memory. No server, real token or DB is used.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

assert.equal(process.argv.length, 2, 'No URL or credentials accepted');
process.umask(0o077);
const root = path.resolve(import.meta.dirname, '..');
const folder = path.join(root, '.local-backups', 'session-risk-' + new Date().toISOString().replaceAll(/[-:.]/g, ''));
fs.mkdirSync(folder, { mode: 0o700 });
const encode = object => Buffer.from(JSON.stringify(object)).toString('base64url');
const user = { id: 'f5000000-0000-0000-0000-000000000999', aud: 'authenticated', email: 'synthetic@example.invalid', app_metadata: {}, user_metadata: {} };
const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}`;
const access = `${body}.${crypto.createHmac('sha256', crypto.randomBytes(32)).update(body).digest('base64url')}`;
const cases = [];
for (const status of [500, 503]) {
  const data = new Map(), events = [];
  const key = 'synthetic-session-' + status;
  let refreshCalls = 0;
  const client = createClient('http://127.0.0.1:1', 'synthetic-anon-key', { auth: {
    autoRefreshToken: false, persistSession: true, detectSessionInUrl: false, storageKey: key,
    storage: { getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: k => { data.delete(k); } },
  }, global: { fetch: async (input) => {
    const url = String(input);
    assert(url.startsWith('http://127.0.0.1:1/auth/v1/'), 'Only synthetic Auth requests accepted');
    if (url.includes('/token')) {
      refreshCalls++;
      if (refreshCalls === 1) return new Response(JSON.stringify({ code: 'unexpected_failure', msg: 'Synthetic temporary write barrier' }), { status, headers: { 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify({ access_token: access, refresh_token: 'synthetic-rotated-token', expires_in: 3600, token_type: 'bearer', user }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify(user), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } } });
  const { data: subscription } = client.auth.onAuthStateChange(event => { events.push(event); });
  const set = await client.auth.setSession({ access_token: access, refresh_token: 'synthetic-original-token' });
  assert(!set.error && data.has(key));
  const result = await client.auth.refreshSession();
  cases.push({ first_refresh_status: status, sdk_error_status: result.error?.status ?? null,
    session_retained: data.has(key), signed_out_event: events.includes('SIGNED_OUT'), refresh_calls: refreshCalls });
  subscription.subscription.unsubscribe();
  client.auth.stopAutoRefresh();
}
assert.equal(cases[0].session_retained, false);
assert.equal(cases[0].signed_out_event, true);
assert.equal(cases[1].session_retained, true);
assert.equal(cases[1].signed_out_event, false);
const report = { diagnostic_passed: true, production_safe: false, observed_hosted_refresh_failure_status: 500,
  finding: 'Full Auth write freeze can invalidate the installed SDK client session on refresh HTTP500.',
  cases, real_credentials_used: false, network_requests_sent: 0, production_connection_used: false,
  installed_auth_js: JSON.parse(fs.readFileSync(path.join(root, 'node_modules/.pnpm/@supabase+auth-js@2.106.2/node_modules/@supabase/auth-js/package.json'))).version };
fs.writeFileSync(path.join(folder, 'verification-report.json'), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ diagnostic_passed: true, production_safe: false, cases, report: path.join(folder, 'verification-report.json') }));
