// Uppspelning av loggade rundor (för felrapporter), och körning av sparade rapporter i
// test/replays/ - varje rapporterat regelfel blir ett permanent test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { GurschGame, PHASE } from '../src/engine/game.js';
import { chooseBotAction, shouldCallSlask } from '../src/engine/bot.js';
import { replayRound, startReplay, applyEvent, logFromReport } from '../src/engine/replay.js';
import { seededRng, realtimeStep } from './helpers.js';

/** Bottar spelar `rounds` rundor. Allt går genom loggade vägar: drag, tick() och expireSlask(). */
function playLoggedGame(rounds, seed) {
  const clock = { t: 1_700_000_000_000 };
  const rng = seededRng(seed);
  const rt = {};
  const g = new GurschGame({ id: 'LOG', rng: seededRng(seed + 1), now: () => clock.t, settings: { miniGurschCap: 0 } });
  for (const id of ['a', 'b', 'c', 'd']) g.addPlayer({ id, nickname: id.toUpperCase() });
  g.startGame('a');
  let done = 0;
  while (done < rounds) {
    clock.t += 1 + Math.floor(rng() * 900);
    // Ibland pausar någon för en felrapport; ibland släpper pausen av sig själv efter 3 min.
    if (g.paused) {
      if (rng() < 0.3) { clock.t = g.paused.until; g.tick(); } else { clock.t += 20_000; g.resume('a'); }
      continue;
    }
    if (g.phase !== PHASE.ROUND_RESULT && rng() < 0.02) { g.pause('a'); continue; }
    const pub = g.publicState();
    if (g.pendingSlask) {
      const caller = g.players.find((p) => p.id !== g.pendingSlask.playerId && shouldCallSlask({ pub, botId: p.id, rng }));
      if (caller && rng() < 0.5) g.handleAction(caller.id, { type: 'callSlask' });
      else g.expireSlask();
      continue;
    }
    if (g.phase === PHASE.ROUND_RESULT) { done += 1; g.nextRound('a'); continue; }
    if (g.phase === PHASE.NEGOTIATION || g.phase === PHASE.DISCARD_SELECT) {
      realtimeStep(g, clock, rng, (id, p, priv) => chooseBotAction({ pub: p, priv, botId: id, rng }), rt);
      continue;
    }
    if (g.turnDeadline && rng() < 0.05) { clock.t = g.turnDeadline; g.tick(); continue; }   // timeout
    const pid = g.currentTurnPlayerId();
    const priv = g.privateState(pid);
    if (priv.actions.some((a) => a.type === 'slask') && rng() < 0.15) { g.handleAction(pid, { type: 'slask' }); continue; }
    g.handleAction(pid, chooseBotAction({ pub, priv, botId: pid, rng }));
  }
  return g;
}

test('varje avslutad runda kan spelas upp exakt likadant från frö + drag', () => {
  const g = playLoggedGame(40, 17);
  const numbers = [...g.roundLogs.keys()];
  assert.equal(numbers.length, 20, 'de 20 senaste rundorna sparas');
  const kinds = new Set();
  for (const n of numbers) {
    const log = g.roundLog(n);
    if (log.result.miniLevel) kinds.add('mini-gursch');
    for (const e of log.events) {
      kinds.add(e.tick ? 'tick' : e.expireSlask ? 'expireSlask' : e.pause ? 'pause' : e.resume ? (e.auto ? 'autoResume' : 'resume') : e.action.type);
    }
    const { game } = replayRound(log);
    assert.equal(game.phase, PHASE.ROUND_RESULT, `runda ${n} tar slut vid uppspelning`);
    assert.equal(game.result.loserId, log.result.loserId, `runda ${n}: samma förlorare`);
    assert.equal(game.result.miniLevel, log.result.miniLevel);
    assert.deepEqual(Object.fromEntries(game.players.map((p) => [p.id, p.balance])), log.result.balances,
      `runda ${n}: samma saldon`);
  }
  // Uppspelningen ska ha provats på alla sorters händelser
  for (const kind of ['discard', 'stay', 'propose', 'play', 'tick', 'slask', 'callSlask', 'expireSlask', 'mini-gursch', 'pause', 'resume', 'autoResume']) assert.ok(kinds.has(kind), `ingen ${kind} i loggarna`);
});

test('npm run replay klarar loggar med alla sorters händelser (även pauser)', () => {
  const g = playLoggedGame(40, 17);
  const dir = mkdtempSync(path.join(tmpdir(), 'gursch-replay-'));
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'replay.js');
  try {
    for (const n of g.roundLogs.keys()) {
      const file = path.join(dir, `runda-${n}.json`);
      writeFileSync(file, JSON.stringify(g.roundLog(n)));
      const run = spawnSync(process.execPath, [script, file], { encoding: 'utf8' });
      assert.equal(run.status, 0, `runda ${n}: ${run.stderr}`);
      assert.match(run.stdout, /Samma resultat som när rundan spelades/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loggen för en pågående runda lämnas aldrig ut (den avslöjar alla händer)', () => {
  const g = new GurschGame({ id: 'X', rng: seededRng(1) });
  g.addPlayer({ id: 'a', nickname: 'A' });
  g.addPlayer({ id: 'b', nickname: 'B' });
  g.startGame('a');
  assert.equal(g.roundLog(1), null);
});

test('ett drag som nu är otillåtet avvisas vid uppspelning', () => {
  const g = playLoggedGame(3, 5);
  const log = g.roundLog(1);
  const i = log.events.findIndex((e) => e.action?.type === 'play' && e.action.cardIds.length === 1);
  const { game, clock } = startReplay(log);
  log.events.slice(0, i).forEach((e) => applyEvent(game, clock, e));
  const bogus = { ...log.events[i], action: { type: 'play', cardIds: ['FAKE'] } };
  assert.throws(() => applyEvent(game, clock, bogus), /äger inte/);
});

// ---- sparade felrapporter ---------------------------------------------------------

const replayDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'replays');
const files = existsSync(replayDir) ? readdirSync(replayDir).filter((f) => f.endsWith('.json')) : [];

for (const file of files) {
  test(`rapporterad runda: ${file}`, () => {
    const report = JSON.parse(readFileSync(path.join(replayDir, file), 'utf8'));
    const log = logFromReport(report);
    const expectations = report.expect ?? [];
    // "accepted": draget rapporterades som fel men är tillåtet - det (och allt före) ska gå igenom.
    for (const ok of expectations.filter((x) => x.accepted)) {
      const { game, clock } = startReplay(log);
      assert.doesNotThrow(() => log.events.slice(0, ok.event + 1).forEach((e) => applyEvent(game, clock, e)),
        `händelse ${ok.event} ska vara tillåten: ${ok.why ?? ''}`);
    }
    const rejected = expectations.find((x) => x.rejected !== undefined);
    if (rejected) {
      // Felet var ett drag som aldrig borde ha tillåtits: allt före ska gå, just det ska avvisas.
      const { game, clock } = startReplay(log);
      log.events.slice(0, rejected.event).forEach((e) => applyEvent(game, clock, e));
      assert.throws(() => applyEvent(game, clock, log.events[rejected.event]), new RegExp(rejected.rejected));
      return;
    }
    const { game } = replayRound(log);
    const expected = expectations.find((x) => x.result)?.result ?? log.result;
    if (!expected) return;   // rapport tagen mitt i rundan utan förväntan: det räcker att den spelas upp
    for (const [key, value] of Object.entries(expected)) {
      if (key === 'balances') {
        assert.deepEqual(Object.fromEntries(game.players.map((p) => [p.id, p.balance])), value);
      } else {
        assert.deepEqual(game.result[key], value, `${key} skiljer sig`);
      }
    }
  });
}
