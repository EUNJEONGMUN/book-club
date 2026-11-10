import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
config({ path: '.env.local', quiet: true });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || !['127.0.0.1','localhost'].includes(new URL(url).hostname)) throw new Error('LOCAL SUPABASE ONLY');
const backup = process.argv[2];
if (!backup) throw new Error('Pass a pre-conversion local database.dump from .local-backups');
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
// A generated PDF under a dedicated fixture meeting ID. Never overwrite existing objects.
const objectPath = `f5000000-0000-0000-0000-000000000021/rehearsal-${crypto.randomUUID()}.pdf`;
const stream = 'BT /F1 12 Tf 30 100 Td (Local preservation fixture) Tj ET';
const objects = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 150] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
let text = '%PDF-1.4\n'; const offsets = [0];
objects.forEach((object,i) => { offsets.push(Buffer.byteLength(text)); text += `${i+1} 0 obj\n${object}\nendobj\n`; });
const xref = Buffer.byteLength(text);
text += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
const pdf = Buffer.from(text);
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
let uploaded = false;
const report = path.resolve(`.local-backups/representative-rehearsal-${Date.now()}.json`);
try {
  const upload = await db.storage.from('discussion-files').upload(objectPath, pdf, { contentType: 'application/pdf', upsert: false });
  if (upload.error) throw upload.error;
  uploaded = true;
  const { data: { publicUrl } } = db.storage.from('discussion-files').getPublicUrl(objectPath);
  async function verifyDownload() {
    if (!['127.0.0.1','localhost'].includes(new URL(publicUrl).hostname)) throw new Error('Non-local URL');
    const res = await fetch(publicUrl, { cache: 'no-store' });
    if (!res.ok || digest(Buffer.from(await res.arrayBuffer())) !== digest(pdf)) throw new Error('Fixture PDF bytes changed');
  }
  await verifyDownload();
  execFileSync('python3', ['scripts/rehearse-single-club.py','--backup',backup,'--pdf-url',publicUrl,'--report',report], { stdio: 'inherit', timeout: 120_000 });
  await verifyDownload();
  const result = JSON.parse(fs.readFileSync(report,'utf8'));
  fs.writeFileSync(report, JSON.stringify({ ...result, pdfDownloadBeforeAndAfter: true, sha256: digest(pdf) }, null, 2));
  console.log('PASS: real local PDF download bytes preserved before/after isolated conversion.');
} finally {
  if (uploaded) {
    // This exact random path was created by this run; existing files are never removed.
    const cleanup = await db.storage.from('discussion-files').remove([objectPath]);
    if (cleanup.error) throw new Error(`Fixture cleanup failed: ${cleanup.error.message}`);
  }
}
