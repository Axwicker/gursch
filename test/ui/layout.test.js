// layout.test.js - det som syns och går att trycka på, i Chromium och WebKit med touch.
//
//   npm run test:layout
//
// Ligger utanför `npm test` (test/*.test.js), eftersom det startar webbläsare och tar några minuter.
// Testerna frågar webbläsaren vad ett tryck faktiskt träffar (elementFromPoint), i stället för att
// jämföra bilder: skärmbilder visar inte vad som tar klick.
//
// Tester märkta todo är kända brister som ska rättas i layoutarbetet (fas 3). De visas i
// resultatet men får inte körningen att misslyckas.

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = process.env.LAYOUT_TEST_PORT || '3216';
const BASE = `http://localhost:${PORT}`;
const LONG_NAME = 'WWWWWWWWWWWWWWWW';   // 16 tecken (gränsen i motorn), det bredaste tänkbara
const TYPICAL_NAME = 'Alexander';
const NARROW = '(max-width: 560px), (max-width: 768px) and (orientation: portrait)';

const SIZES = [
  [320, 568], [360, 640], [375, 553], [375, 667], [390, 844], [430, 932],   // stående telefon
  [568, 320], [667, 375], [844, 390], [932, 430],                           // liggande telefon
  [600, 800], [768, 1024], [820, 1180], [800, 600],                         // surfplatta, litet fönster
  [1024, 600], [1024, 768], [1280, 600], [1280, 720], [1366, 768], [1920, 1080],   // dator
];

let server;

before(async () => {
  const env = { ...process.env, PORT, GURSCH_SEED: '4711' };
  for (const key of Object.keys(env)) if (key.startsWith('SUPABASE')) delete env[key];   // inga rapporter till betan
  server = spawn(process.execPath, ['src/server/index.js'], { cwd: ROOT, env, stdio: 'ignore' });
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${BASE}/health`)).ok) return; } catch { /* startar fortfarande */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Servern svarade inte på ${BASE}`);
});
after(() => server?.kill());

/** En pausad runda med fem spelare: inga timers och inga bottar stör mätningen. */
async function startRound(browser) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }, hasTouch: true, locale: 'sv-SE', reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.goto(BASE);
  await page.fill('#player-nick', LONG_NAME);
  await page.check('input[name="practice-level"][value="medium"]');
  await page.click('#btn-practice');
  await page.waitForFunction(() => window.__gursch?.S?.players.length === 4);
  await page.evaluate(() => window.__gursch.emit('addBot', {}));
  await page.waitForFunction(() => window.__gursch.S.players.length === 5);
  await page.click('#btn-start');
  await page.waitForFunction(() => window.__gursch?.S?.phase && window.__gursch.S.phase !== 'LOBBY');
  await page.waitForFunction(() => window.__gursch.P.hand.length === 5);
  await page.waitForTimeout(3200);   // utdelningens flygande kort
  await page.evaluate(() => window.__gursch.emit('pauseGame', {}));
  await page.waitForFunction(() => window.__gursch.S.paused);
  await page.evaluate(() => { document.getElementById('pause-banner').hidden = true; });
  return { context, page };
}

async function resize(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** Ritar dragningen (R31) med `slots` dolda kort, som ska väljas av spelaren själv. */
function drawTiebreak(page, slots) {
  return page.evaluate((count) => {
    const g = window.__gursch;
    document.getElementById('pause-banner').hidden = true;
    const ids = g.S.players.map((p) => p.id);
    Object.assign(g.S, {
      phase: 'TIEBREAK_DRAW', trick: null, negotiation: null, discardSelect: null, turnPlayerId: g.me,
      tiebreak: { participants: ids, active: ids, drawNumber: 1, slotCount: count, taken: [], draws: [[]], loserId: null, settleAt: null, tiedValue: 12 },
    });
    g.P.actions = [{ type: 'tiebreakPick', options: Array.from({ length: count }, (_, i) => i) }];
    g.render.renderCenter();
    g.render.renderSeats();
  }, slots);
}

/** Ritar ett stick där alla fem lagt ett kort. Vanliga namn: 16 W hos alla bryter statusraden i två rader. */
function drawTrick(page, cardsEach = 1) {
  return page.evaluate(([name, each]) => {
    const g = window.__gursch;
    document.getElementById('pause-banner').hidden = true;
    // Som i en riktig runda: status, uppvänt kort, baksidor och märken gör motspelarraden högre.
    g.S.players.forEach((p, i) => {
      Object.assign(p, { nickname: name, status: '1 kort', handCount: 4, slasks: i === 1 ? 1 : 0 });
      // Den som slaskat har en ny hand och inget uppvänt kort.
      p.visibleCards = p.id === g.me || i === 1 ? [] : [{ id: `v${i}`, rank: 6 + i, suit: 'spades' }];
    });
    g.S.flopWinnerId = g.S.players.at(-2).id;
    const suits = ['hearts', 'spades', 'clubs', 'diamonds', 'hearts'];
    const plays = g.S.players.map((p, i) => ({
      playerId: p.id,
      cards: Array.from({ length: each }, (_, k) => ({ id: `t${i}-${k}`, rank: 8 + i, suit: suits[(i + k) % 5] })),
    }));
    Object.assign(g.S, {
      phase: 'TRICK', tiebreak: null, negotiation: null, discardSelect: null, turnPlayerId: g.me, lastTrick: null,
      trick: { trickNumber: 2, plays, leadingPlayerId: plays[0].playerId, lastWinnerId: null, leadCount: 1 },
    });
    g.P.actions = [];
    g.render.renderCenter();
    g.render.renderSeats();
  }, [TYPICAL_NAME, cardsEach]);
}

/** Motspelarnas namn görs längsta möjliga (bottarna heter annars kort). */
const longOpponentNames = (page, name) => page.evaluate((text) => {
  for (const nick of document.querySelectorAll('.seat:not(.me) .nick')) nick.textContent = text;
}, name);

const where = (w, h) => `${w}×${h}`;

for (const [engine, type] of [['chromium', chromium], ['webkit', webkit]]) {
  describe(`layout i ${engine}`, { timeout: 600_000 }, () => {
    let browser, context, page;
    before(async () => {
      browser = await type.launch();
      ({ context, page } = await startRound(browser));
    });
    after(async () => { await context?.close(); await browser?.close(); });

    test('handkorten täcks aldrig av något', async () => {
      const problems = [];
      for (const [w, h] of SIZES) {
        await resize(page, w, h);
        await longOpponentNames(page, LONG_NAME);
        const covered = await page.evaluate(() => [...document.querySelectorAll('.hand .card')].flatMap((card) => {
          const r = card.getBoundingClientRect();
          return [[.5, .5], [.15, .15], [.85, .15], [.15, .85], [.85, .85]].flatMap(([fx, fy]) => {
            const x = r.left + r.width * fx, y = r.top + r.height * fy;
            if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return ['utanför skärmen'];
            const top = document.elementFromPoint(x, y);
            return card.contains(top) ? [] : [top?.className || top?.tagName];
          });
        }));
        if (covered.length) problems.push(`${where(w, h)}: ${[...new Set(covered)].join(', ')}`);
      }
      assert.deepEqual(problems, []);
    });

    test('ingen skylt fångar tryck på dragningens kort', async () => {
      const problems = [];
      for (const [w, h] of SIZES) {
        await resize(page, w, h);
        await drawTiebreak(page, 32);
        const seats = await page.evaluate(() => [...document.querySelectorAll('.tb-slot')].filter((slot) => {
          slot.scrollIntoView({ block: 'center' });
          const r = slot.getBoundingClientRect();
          return document.elementFromPoint(r.left + Math.min(12, r.width / 2), r.top + r.height * .55)?.closest('.seat');
        }).length);
        if (seats) problems.push(`${where(w, h)}: ${seats} kort`);
      }
      assert.deepEqual(problems, []);
    });

    test('ett tryck på ett kort som ligger under din skylt når kortet', async () => {
      await resize(page, 1024, 600);
      await drawTiebreak(page, 32);
      const point = await page.evaluate(() => {
        const badge = document.querySelector('.seat.me .seat-badge').getBoundingClientRect();
        for (const slot of document.querySelectorAll('.tb-slot')) {
          const r = slot.getBoundingClientRect();
          const x = r.left + 10, y = r.top + r.height * .55;
          if (x > badge.left && x < badge.right && y > badge.top && y < badge.bottom) {
            window.__tapped = null;
            document.addEventListener('click', (e) => { window.__tapped = e.target.closest('.tb-slot')?.dataset.slot ?? 'annat'; }, { capture: true, once: true });
            return { x, y, slot: slot.dataset.slot };
          }
        }
        return null;
      });
      assert.ok(point, 'inget kort låg under skylten i 1024×600 - testet prövar inte längre det här');
      await page.touchscreen.tap(point.x, point.y);
      await page.waitForFunction(() => window.__tapped !== null);
      assert.equal(await page.evaluate(() => window.__tapped), point.slot);
    });

    test('skyltarna följer layouten när skärmen vrids', async () => {
      await page.evaluate(() => window.__gursch.render.renderSeats());
      const rotations = [[[390, 844], [844, 390]], [[844, 390], [390, 844]], [[768, 1024], [1024, 768]], [[1024, 768], [768, 1024]]];
      for (const [from, to] of rotations) {
        await resize(page, ...from);
        await page.waitForTimeout(150);
        await resize(page, ...to);
        await page.waitForTimeout(150);
        const state = await page.evaluate((query) => ({
          narrow: matchMedia(query).matches,
          strip: document.getElementById('seats').classList.contains('strip'),
          meInFlow: Boolean(document.querySelector('#seat-me .seat.me')),
        }), NARROW);
        assert.equal(state.strip, state.narrow, `${where(...from)} → ${where(...to)}`);
        assert.equal(state.meInFlow, state.narrow, `${where(...from)} → ${where(...to)}`);
      }
    });

    test('FLOP-bannern slutar ovanför handen', async () => {
      const problems = [];
      for (const [w, h] of SIZES) {
        await resize(page, w, h);
        await page.waitForTimeout(20);
        await page.evaluate((name) => window.__gursch.render.banner(`FLOP: ${name} K`), 'Alexander Johans');
        const gap = await page.evaluate(() => {
          const banner = [...document.querySelectorAll('.fx-banner')].at(-1);
          const top = document.querySelector('.hand .card').getBoundingClientRect().top;
          const result = top - banner.getBoundingClientRect().bottom;
          document.querySelectorAll('.fx-banner').forEach((n) => n.remove());
          return result;
        });
        if (gap < 0) problems.push(`${where(w, h)}: ${Math.round(-gap)} px in i korten`);
      }
      assert.deepEqual(problems, []);
    });

    test('ett tryck på låsta kort ger svar men väljer inget', async () => {
      await resize(page, 390, 844);
      await page.evaluate(() => {
        window.__gursch.P.actions = [{ type: 'stay' }];
        window.__gursch.render.renderHand();
      });
      const card = page.locator('.hand .card').first();
      // Ett riktigt tryck på skärmen: card.tap() vägrar, eftersom låsta kort är aria-disabled.
      const box = await card.boundingBox();
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForSelector('#hand-hint.nudge', { timeout: 2000 });
      assert.equal(await card.getAttribute('aria-pressed'), 'false');
      assert.equal(await card.getAttribute('aria-disabled'), 'true');
      assert.ok(await page.locator('#hand-hint.nudge').count(), 'ledtexten lyste inte upp');
      // Syns utan muspekare: låst kort ser annorlunda ut än ett valbart.
      assert.notEqual(await card.evaluate((n) => getComputedStyle(n).filter), 'none');
    });

    test('ett helt stick med fem spelare ryms ovanför din skylt på stående telefon', async () => {
      const problems = [];
      // 402×660 är den verkliga ytan i Safari på iPhone, enligt betarapporternas skärmdata.
      for (const [w, h, each] of [[375, 667, 1], [390, 664, 1], [390, 844, 1], [402, 660, 1], [402, 660, 2], [402, 720, 2], [430, 932, 2]]) {
        await resize(page, w, h);
        await drawTrick(page, each);
        const clipped = await page.evaluate(() => {
          const center = document.querySelector('.table-center');
          center.scrollTop = 0;
          const bottom = center.getBoundingClientRect().bottom;
          const seat = document.querySelector('.seat.me .seat-badge').getBoundingClientRect().top;
          const cards = [...document.querySelectorAll('.trick-area .card')].map((c) => c.getBoundingClientRect().bottom);
          return Math.round(Math.max(0, Math.max(...cards) - Math.min(bottom, seat)));
        });
        if (clipped) problems.push(`${where(w, h)}, ${each} kort var: ${clipped} px klipps av`);
      }
      assert.deepEqual(problems, []);
    });

    test('långa namn håller sig på bordet och inne i bilden', async () => {
      const problems = [];
      for (const [w, h] of SIZES) {
        await resize(page, w, h);
        await longOpponentNames(page, LONG_NAME);
        const result = await page.evaluate(() => {
          const felt = document.querySelector('.felt').getBoundingClientRect();
          const me = document.querySelector('.seat.me .seat-badge').getBoundingClientRect();
          const all = [...document.querySelectorAll('.seat .seat-badge')].map((b) => b.getBoundingClientRect());
          return {
            outsideFelt: Math.max(0, me.right - felt.right, felt.left - me.left),
            outsideScreen: Math.max(0, ...all.map((b) => Math.max(b.right - innerWidth, -b.left))),
          };
        });
        if (result.outsideFelt > 0.5 || result.outsideScreen > 0.5) problems.push(`${where(w, h)}: ${JSON.stringify(result)}`);
      }
      assert.deepEqual(problems, []);
    });

    test('motspelarnas skyltar går inte in i varandra', { todo: 'fas 3: låga fönster' }, async () => {
      const problems = [];
      for (const [w, h] of SIZES) {
        await resize(page, w, h);
        await longOpponentNames(page, LONG_NAME);
        const hits = await page.evaluate(() => {
          const all = [...document.querySelectorAll('.seat .seat-badge')].map((b) => b.getBoundingClientRect());
          let n = 0;
          for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
            if (Math.min(all[i].right, all[j].right) > Math.max(all[i].left, all[j].left) && Math.min(all[i].bottom, all[j].bottom) > Math.max(all[i].top, all[j].top)) n++;
          }
          return n;
        });
        if (hits) problems.push(`${where(w, h)}: ${hits}`);
      }
      assert.deepEqual(problems, []);
    });

    test('din skylt ligger inte över korten på bordet', { todo: 'fas 3: skylten i flödet (#18)' }, async () => {
      const problems = [];
      for (const [w, h] of SIZES) {
        await resize(page, w, h);
        await drawTiebreak(page, 32);
        const hits = await page.evaluate(() => {
          const badge = document.querySelector('.seat.me .seat-badge').getBoundingClientRect();
          return [...document.querySelectorAll('.tb-slot')].filter((slot) => {
            const r = slot.getBoundingClientRect();
            return Math.min(r.right, badge.right) > Math.max(r.left, badge.left) && Math.min(r.bottom, badge.bottom) > Math.max(r.top, badge.top);
          }).length;
        });
        if (hits) problems.push(`${where(w, h)}: ${hits} kort`);
      }
      assert.deepEqual(problems, []);
    });

    test('dragningens kort ligger inte bakom handen', { todo: 'fas 3: låg layout (#20)' }, async () => {
      const problems = [];
      for (const [w, h] of SIZES) {
        await resize(page, w, h);
        await drawTiebreak(page, 32);
        const hidden = await page.evaluate(() => {
          document.querySelector('#screen-game').scrollTop = 0;
          return [...document.querySelectorAll('.tb-slot')].filter((slot) => {
            const r = slot.getBoundingClientRect();
            return document.elementFromPoint(r.left + Math.min(12, r.width / 2), r.top + r.height * .55)?.closest('.handbar');
          }).length;
        });
        if (hidden) problems.push(`${where(w, h)}: ${hidden} kort`);
      }
      assert.deepEqual(problems, []);
    });
  });
}
