// screenshots.js - spelar en runda mot bottar och tar skärmbilder i varje fas, i mobil- och
// datorstorlek. Referensbilderna (--baseline) jämförs med senaste körningen i en översiktssida.
//
//   npm run screenshots              -> screenshots/current/  (+ index.html med jämförelse)
//   npm run screenshots -- --baseline  -> screenshots/baseline/ (referensen, versionshanteras)
//   npm run screenshots -- --only mobil
//
// Startar en egen server (PORT, standard 3217) med ett fast slumpfrö, så att samma kort delas
// ut varje gång. Bottarnas val är fortfarande slumpade, så senare faser kan skilja sig åt.
// Skriptet agerar via window.__gursch.emit och kort-id:n (data-id), aldrig via knapptexter,
// så att det fortsätter fungera när gränssnittet görs om.

import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_ROOT = path.join(ROOT, 'screenshots');

const args = process.argv.slice(2);
const argValue = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
const LABEL = args.includes('--baseline') ? 'baseline' : 'current';
const ONLY = argValue('--only');
const SEED = argValue('--seed') ?? '4711';
const PORT = process.env.PORT || '3217';
const BASE = `http://localhost:${PORT}`;
const ROUND_TIMEOUT_MS = 240_000;

const VIEWPORTS = {
  mobil: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  dator: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
};

// ------------------------------------------------------------------ server

async function startServer() {
  const server = spawn(process.execPath, ['src/server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT, GURSCH_SEED: SEED },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stdout.on('data', (d) => { log += d; });
  server.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 50; i++) {
    if (server.exitCode !== null) throw new Error(`Servern avslutades:\n${log}`);
    try { if ((await fetch(`${BASE}/health`)).ok) return { server, log: () => log }; } catch { /* startar fortfarande */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  server.kill();
  throw new Error(`Servern svarade inte på ${BASE}:\n${log}`);
}

// ------------------------------------------------------------------ en runda

/** Läser det klienten vet just nu (publikt + privat state). */
function readState(page) {
  return page.evaluate(() => {
    const g = window.__gursch;
    if (!g?.S) return null;
    const n = g.S.negotiation;
    return {
      phase: g.S.phase,
      me: g.me,
      actions: g.P.actions,
      hand: g.P.hand,
      pendingSlask: Boolean(g.S.pendingSlask && !g.S.pendingSlask.resolved),
      trickPlays: g.S.trick?.plays.length ?? 0,
      negotiation: n && { number: n.number, agreed: n.agreedCount, proposals: n.proposals },
    };
  });
}

const emit = (page, event, payload) => page.evaluate(([e, p]) => window.__gursch.emit(e, p), [event, payload]);

async function selectCards(page, ids) {
  for (const id of ids) await page.locator(`.hand .card[data-id="${id}"]`).click({ timeout: 5000 });
}

/** Öppnar en sidopanel, tar bilden när den glidit in och stänger den igen. */
async function openPanel(page, button, panelId, capture) {
  await page.locator(button).click();
  await page.waitForTimeout(450);
  await capture();
  await page.locator(`[data-close="${panelId}"]`).click();
  await page.waitForTimeout(300);
}

/** Det förslag som flest andra har lagt, eller null. */
function commonProposal(proposals, me) {
  const counts = new Map();
  for (const [id, v] of Object.entries(proposals)) if (id !== me && v) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

async function playRound(page, shot) {
  const taken = new Set();
  /** Tar bilden `name` första gången, annars ingenting. */
  const once = async (name, waitMs = 0) => {
    if (taken.has(name)) return;
    taken.add(name);
    if (waitMs) await page.waitForTimeout(waitMs);
    await shot(name);
  };
  const handledNegotiations = new Set();
  let lastProposalAt = 0;
  let slasked = false;
  const deadline = Date.now() + ROUND_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const st = await readState(page);
    if (!st) { await page.waitForTimeout(150); continue; }
    const act = (type) => st.actions.find((a) => a.type === type);

    if (st.pendingSlask) {
      await once('10-slask', 400);
    } else if (st.phase === 'ROUND_RESULT') {
      await once('13-resultat', 900);
      await page.locator('#btn-leave-game').click();
      await once('16-lamna', 300);
      await page.locator('#confirm-cancel').click();
      return taken;
    } else if (act('propose')) {
      const n = st.negotiation;
      const current = act('propose').current;
      if (n.number > 1) {
        // Andra förhandlingen: STAY så att spelet går vidare till stickspelet.
        await once('07c-forhandling-2');
        await emit(page, 'action', { type: 'stay' });
      } else if (!handledNegotiations.has(n.number)) {
        handledNegotiations.add(n.number);
        await emit(page, 'action', { type: 'propose', count: 2 });
        lastProposalAt = Date.now();
        await once('07-forhandling', 600);
      } else if (n.agreed) {
        await once('07b-forhandling-enighet', 200);
      } else {
        // Anpassa sig till bottarna så att det blir enighet och kortvalet också kommer med.
        const common = commonProposal(n.proposals, st.me);
        if (common && common !== current && Date.now() - lastProposalAt > 2000) {
          await emit(page, 'action', { type: 'propose', count: common });
          lastProposalAt = Date.now();
        }
      }
    } else if (act('discard')) {
      const a = act('discard');
      const count = a.free ? 2 : a.count;
      const ids = [...st.hand].sort((x, y) => y.rank - x.rank).slice(0, count).map((c) => c.id);   // högsta korten
      const realtime = st.phase === 'DISCARD_SELECT';
      await selectCards(page, ids);
      await once(realtime ? '08-valj-kort' : '05-slang-valj', 250);
      await emit(page, 'action', { type: 'discard', cardIds: ids });
      await once(realtime ? '08b-slangning-alla' : '06-slangning', 380);
      await page.waitForTimeout(1200);
    } else if (act('pass')) {
      await once('09-sista-slask');
      // En slask ger bilden på slaskfönstret. Går den inte (max nått) passar vi.
      if (!slasked && act('slask')) { slasked = true; await emit(page, 'action', { type: 'slask' }); }
      else await emit(page, 'action', { type: 'pass' });
    } else if (act('play')) {
      const a = act('play');
      const ids = a.options[0];
      await selectCards(page, ids);
      await once(a.lead ? '11-stick-leder' : '11-stick-folj', 250);
      await emit(page, 'action', { type: 'play', cardIds: ids });
      await once('12-stick-lagt', 400);
    } else if (st.phase === 'INITIAL_DISCARD') {
      await once('05b-slang-vantar');
    } else if ((st.phase === 'TRICK' || st.phase === 'MINI_GURSCH') && st.trickPlays >= 2) {
      await once('12b-stick-motstandare');
      // Sidopanelerna fotograferas under stickspelet: efter rundan ligger de bakom resultatrutan.
      if (!taken.has('14-historik')) {
        await openPanel(page, '#btn-history', 'history-panel', () => once('14-historik'));
        if (await page.locator('#btn-chat-toggle').isVisible()) {
          await openPanel(page, '#btn-chat-toggle', 'chat-panel', () => once('15-chatt'));
        }
      }
    }
    await page.waitForTimeout(150);
  }
  throw new Error(`Rundan blev inte klar inom ${ROUND_TIMEOUT_MS / 1000} s (bilder hittills: ${[...taken].join(', ')})`);
}

async function runViewport(browser, name) {
  const dir = path.join(OUT_ROOT, LABEL, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({ ...VIEWPORTS[name], locale: 'sv-SE', reducedMotion: 'no-preference' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = async (file) => {
    await page.screenshot({ path: path.join(dir, `${file}.png`) });
    console.log(`  ${name}/${file}`);
  };

  await page.goto(`${BASE}/join/ABCD`);
  await page.waitForFunction(() => document.fonts.ready);
  await shot('01b-inbjudan');
  await page.goto(BASE);
  await shot('01-start');

  await page.fill('#player-nick', 'Axel');
  await page.check('input[name="practice-level"][value="medium"]');
  await page.click('#btn-practice');
  await page.waitForFunction(() => window.__gursch?.S?.players.length === 4);
  await page.waitForTimeout(400);
  await shot('02-lobby');

  await page.click('#btn-start');
  await page.waitForFunction(() => window.__gursch?.S?.phase && window.__gursch.S.phase !== 'LOBBY');
  await page.waitForTimeout(700);
  await shot('03-utdelning');
  await page.waitForTimeout(2600);
  await shot('04-efter-utdelning');

  await playRound(page, shot);
  await context.close();
  return errors;
}

// ------------------------------------------------------------------ översiktssida

function writeIndex() {
  const dir = path.join(OUT_ROOT, LABEL);
  const compare = LABEL !== 'baseline' && existsSync(path.join(OUT_ROOT, 'baseline'));
  const sections = Object.keys(VIEWPORTS).filter((v) => existsSync(path.join(dir, v))).map((v) => {
    const files = new Set(readdirSync(path.join(dir, v)));
    if (compare && existsSync(path.join(OUT_ROOT, 'baseline', v))) {
      for (const f of readdirSync(path.join(OUT_ROOT, 'baseline', v))) files.add(f);
    }
    const rows = [...files].filter((f) => f.endsWith('.png')).sort().map((f) => {
      const cell = (label, src, exists) => `<figure><figcaption>${label}</figcaption>${exists ? `<a href="${src}"><img src="${src}" loading="lazy"></a>` : '<p class="missing">saknas</p>'}</figure>`;
      const cur = cell(compare ? 'nu' : LABEL, `${v}/${f}`, existsSync(path.join(dir, v, f)));
      const base = compare ? cell('referens', `../baseline/${v}/${f}`, existsSync(path.join(OUT_ROOT, 'baseline', v, f))) : '';
      return `<section><h3>${f.replace('.png', '')}</h3><div class="pair">${base}${cur}</div></section>`;
    }).join('\n');
    return `<h2>${v}</h2>\n<div class="grid ${v}">${rows}</div>`;
  }).join('\n');
  writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html lang="sv"><meta charset="utf-8">
<title>Gursch skärmbilder (${LABEL})</title>
<style>
  body { font: 15px/1.4 system-ui, sans-serif; margin: 24px; background: #111; color: #eee; }
  h2 { margin: 32px 0 12px; } h3 { font-size: 13px; font-weight: 600; margin: 0 0 6px; color: #aaa; }
  .grid { display: grid; gap: 24px; grid-template-columns: repeat(auto-fill, minmax(min(${compare ? 420 : 220}px, 100%), 1fr)); }
  .grid.dator { grid-template-columns: repeat(auto-fill, minmax(min(${compare ? 900 : 440}px, 100%), 1fr)); }
  .pair { display: flex; gap: 8px; } figure { margin: 0; flex: 1; } figcaption { font-size: 12px; color: #888; }
  img { width: 100%; border: 1px solid #333; border-radius: 6px; } .missing { color: #666; }
</style>
<h1>Gursch skärmbilder: ${compare ? 'referens mot nu' : LABEL}</h1>
<p>Frö ${SEED} · ${new Date().toLocaleString('sv-SE')}</p>
${sections}
</html>`);
  return path.join(dir, 'index.html');
}

// ------------------------------------------------------------------ main

const { server, log } = await startServer();
const browser = await chromium.launch({ channel: 'chrome' });
let failed = false;
try {
  const names = ONLY ? [ONLY] : Object.keys(VIEWPORTS);
  console.log(`Skärmbilder → screenshots/${LABEL}/ (server ${BASE}, frö ${SEED})`);
  const results = await Promise.allSettled(names.map((n) => runViewport(browser, n)));
  results.forEach((r, i) => {
    if (r.status === 'rejected') { failed = true; console.error(`\n${names[i]}: ${r.reason?.stack ?? r.reason}`); }
    else if (r.value.length) console.warn(`\n${names[i]}: fel i webbläsaren:\n  ${r.value.join('\n  ')}`);
  });
  console.log(`\nÖversikt: ${writeIndex()}`);
} catch (err) {
  failed = true;
  console.error(err);
  console.error(log());
} finally {
  await browser.close();
  server.kill();
}
process.exit(failed ? 1 : 0);
