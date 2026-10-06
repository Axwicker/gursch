// pull-reports.js - hämtar nya felrapporter och serverfel från betaserverns Supabase.
//
//   npm run reports:pull
//
// Rapporterna sparas i reports/ i samma format som lokalt, så `npm run replay` fungerar
// direkt. Varje rapport markeras som hämtad (pulled_at) och hämtas bara en gång. Nya
// serverfel skrivs till reports/serverfel-<tid>.json och sammanfattas här.
// Kräver SUPABASE_URL och SUPABASE_SECRET_KEY i .env (läses av npm-skriptet).

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { supabaseFromEnv, supabaseRequest, reportFileName } from '../src/server/store.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORTS_DIR = path.join(ROOT, 'reports');

const db = supabaseFromEnv();
if (!db) {
  console.error('SUPABASE_URL och SUPABASE_SECRET_KEY saknas. Lägg dem i .env (se README).');
  process.exit(1);
}
mkdirSync(REPORTS_DIR, { recursive: true });
const stamp = new Date().toISOString();

const reports = await supabaseRequest(db, 'GET', 'reports', {
  query: '?pulled_at=is.null&select=id,report&order=created_at.asc',
});
for (const { report } of reports) {
  const file = path.join(REPORTS_DIR, reportFileName(report));
  if (!existsSync(file)) writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`  ${path.relative(ROOT, file)}  [${report.category ?? 'regel'}] ${report.reportedBy}: ${report.description.split('\n')[0].slice(0, 80)}`);
}
if (reports.length) {
  await supabaseRequest(db, 'PATCH', 'reports', {
    query: `?id=in.(${reports.map((r) => r.id).join(',')})`, body: { pulled_at: stamp }, prefer: 'return=minimal',
  });
}
console.log(`${reports.length} nya rapporter.`);

const errors = await supabaseRequest(db, 'GET', 'server_errors', {
  query: '?pulled_at=is.null&select=*&order=created_at.asc',
});
if (errors.length) {
  const file = path.join(REPORTS_DIR, `serverfel-${stamp.replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, `${JSON.stringify(errors, null, 2)}\n`);
  const byMessage = new Map();
  for (const e of errors) byMessage.set(e.message, (byMessage.get(e.message) || 0) + 1);
  for (const [message, n] of byMessage) console.log(`  ${n}× ${message}`);
  await supabaseRequest(db, 'PATCH', 'server_errors', {
    query: `?id=in.(${errors.map((e) => e.id).join(',')})`, body: { pulled_at: stamp }, prefer: 'return=minimal',
  });
  console.log(`${errors.length} nya serverfel → ${path.relative(ROOT, file)}`);
} else {
  console.log('Inga nya serverfel.');
}
