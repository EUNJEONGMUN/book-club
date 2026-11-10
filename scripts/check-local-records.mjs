import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Deliberately fixed to local containers. No URL, key, or linked-project option.
const tables = [
  'public.club_settings', 'public.members', 'public.invites', 'public.profiles',
  'public.meetings', 'public.discussion_questions', 'public.attendances', 'public.meeting_reviews',
  'auth.users', 'auth.identities', 'storage.objects', 'storage.buckets',
  'legacy_multiclub.clubs', 'legacy_multiclub.club_members', 'legacy_multiclub.club_invites',
  'legacy_multiclub.profiles_before_single_club', 'legacy_multiclub.meetings_before_single_club',
];
const [mode, filename] = process.argv.slice(2);
const root = path.resolve('.local-backups');
const target = path.resolve(filename ?? '.local-backups/phase3-before.json');
if (!['snapshot', 'compare'].includes(mode) || !target.startsWith(root + path.sep)) {
  throw new Error('Usage: node scripts/check-local-records.mjs snapshot|compare .local-backups/name.json');
}
function records(table) {
  const query = `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM ${table} t`;
  return JSON.parse(execFileSync('docker', ['exec', 'supabase_db_book-club', 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-c', query], { encoding: 'utf8' }));
}
function canonical(table, rows) {
  // Signing in legitimately updates timestamps. Identity and password fields must remain intact.
  const fields = table === 'auth.users' ? ['id','email','encrypted_password','role','aud','email_confirmed_at','created_at']
    : table === 'auth.identities' ? ['id','user_id','provider_id','provider','identity_data','created_at'] : null;
  return JSON.stringify(rows.map(row => JSON.stringify(fields
    ? Object.fromEntries(fields.map(k => [k, row[k]]))
    : Object.fromEntries(Object.entries(row).sort(([a],[b]) => a.localeCompare(b))))).sort());
}
const current = Object.fromEntries(tables.map(t => [t, records(t)]));
if (mode === 'snapshot') {
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.writeFileSync(target, JSON.stringify(current), { flag: 'wx', mode: 0o600 });
  console.log(`Saved local records: ${target}`);
} else {
  const before = JSON.parse(fs.readFileSync(target, 'utf8'));
  for (const table of tables) {
    if (!before[table] || canonical(table, before[table]) !== canonical(table, current[table])) throw new Error(`Records changed: ${table}`);
  }
  console.log(`PASS: all records in ${tables.length} local tables preserved (including account identity and credentials).`);
}
