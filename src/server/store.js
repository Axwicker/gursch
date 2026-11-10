// store.js - var felrapporter och serverfel hamnar.
//
// Lokalt sparas rapporterna som filer i reports/, precis som förut. På betaservern (Render)
// försvinner disken vid varje omstart, så där sätts SUPABASE_URL och SUPABASE_SECRET_KEY och
// allt skrivs till Supabase i stället. `npm run reports:pull` hämtar sedan hem rapporterna
// till reports/ så att uppspelningen fungerar likadant.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Supabase-anslutning från miljön, eller null om den inte är konfigurerad. */
export function supabaseFromEnv(env = process.env) {
  const url = env.SUPABASE_URL?.replace(/\/+$/, '');
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

/** Anropar Supabase REST-API (PostgREST). Kastar vid fel. */
export async function supabaseRequest(db, method, table, { query = '', body, prefer } = {}) {
  const headers = { apikey: db.key, 'Content-Type': 'application/json' };
  // Äldre service_role-nycklar är JWT:er och skickas även som Bearer; nya sb_secret_-nycklar räcker i apikey.
  if (db.key.startsWith('eyJ')) headers.Authorization = `Bearer ${db.key}`;
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${db.url}/rest/v1/${table}${query}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${method} ${table}: ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

/** Filnamnet en rapport får i reports/ (samma lokalt och när den hämtas från Supabase). */
export function reportFileName(report) {
  return `${report.createdAt.replace(/[:.]/g, '-')}-runda-${report.log?.roundNumber ?? 'x'}.json`;
}

const ERRORS_PER_MINUTE = 30;              // så många serverfel sparas i databasen per minut
const REPORTS_CHECK_MS = 6 * 60 * 60_000;  // hur ofta /health kontrollerar databasen

export function createStore({ reportsDir, version, env = process.env }) {
  const db = supabaseFromEnv(env);
  let errorTimes = [];
  let lastCheck = 0;

  return {
    mode: db ? 'supabase' : 'file',
    reportsStatus: db ? 'unknown' : 'file',

    /**
     * Kontrollerar att rapporterna går att spara. Körs av /health och väntar aldrig på svaret.
     * Håller också Supabase vaket: projektet pausas annars efter en vecka utan trafik.
     */
    checkReports() {
      if (!db || Date.now() - lastCheck < REPORTS_CHECK_MS) return;
      lastCheck = Date.now();
      supabaseRequest(db, 'GET', 'reports', { query: '?select=created_at&limit=1' })
        .then(() => { this.reportsStatus = 'ok'; })
        .catch((err) => { this.reportsStatus = 'error'; console.error('Rapporterna går inte att spara:', err.message); });
    },

    /** Sparar en felrapport. Returnerar { where } för loggen. */
    async saveReport(report) {
      if (db) {
        await supabaseRequest(db, 'POST', 'reports', {
          body: {
            created_at: report.createdAt,
            version,
            category: report.category,
            description: report.description,
            reported_by: report.reportedBy,
            room: report.room,
            phase: report.phaseWhenReported,
            report,
          },
          prefer: 'return=minimal',
        });
        return { where: 'Supabase' };
      }
      const file = path.join(reportsDir, reportFileName(report));
      mkdirSync(reportsDir, { recursive: true });
      writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
      return { where: path.relative(process.cwd(), file) };
    },

    /** Loggar ett oväntat serverfel. Får aldrig själv kasta - felet är redan ett fel. */
    async logError({ room = null, phase = null, error }) {
      const message = String(error?.message ?? error).slice(0, 1000);
      const stack = String(error?.stack ?? '').slice(0, 8000);
      console.error(`[serverfel] ${room ?? '-'} ${phase ?? '-'}:`, error);
      if (!db) return;
      // En klient som bombarderar med trasiga anrop ska inte kunna fylla databasen.
      const now = Date.now();
      errorTimes = errorTimes.filter((t) => now - t < 60_000);
      if (errorTimes.length >= ERRORS_PER_MINUTE) return;
      errorTimes.push(now);
      try {
        await supabaseRequest(db, 'POST', 'server_errors', {
          body: { version, room, phase, message, stack }, prefer: 'return=minimal',
        });
      } catch (err) {
        console.error('Kunde inte logga serverfelet i Supabase:', err.message);
      }
    },
  };
}
