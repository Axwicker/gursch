import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GurschGame, PHASE } from '../src/engine/game.js';
import { seededRng, rigRound, hand } from './helpers.js';

/** Spel med en klocka som testet styr. */
function timedGame(names, settings = {}) {
  const clock = { t: 1_000_000 };
  const g = new GurschGame({ id: 'T', rng: seededRng(5), now: () => clock.t, settings: { turnSeconds: 30, ...settings } });
  for (const n of names) g.addPlayer({ id: n.toLowerCase(), nickname: n });
  return { g, clock };
}

test('[A1] turen får en deadline som startar om när turen går vidare', () => {
  const { g, clock } = timedGame(['Axel', 'Erik']);
  g.startGame('axel');
  assert.equal(g.turnDeadline, clock.t + 30_000);
  assert.equal(g.publicState().turnDeadline, g.turnDeadline);
  clock.t += 10_000;
  g.handleAction(g.currentTurnPlayerId(), { type: 'stay' });
  assert.equal(g.turnDeadline, clock.t + 30_000, 'ny spelare får full tid');
});

test('[A1] inget händer före deadline', () => {
  const { g, clock } = timedGame(['Axel', 'Erik']);
  g.startGame('axel');
  const first = g.currentTurnPlayerId();
  clock.t += 29_999;
  assert.equal(g.expireTurn(), false);
  assert.equal(g.currentTurnPlayerId(), first);
});

test('[A1] [R20] timeout i slängfasen ger STAY, i sista slaskchansen PASS', () => {
  const { g, clock } = timedGame(['Axel', 'Erik']);
  g.startGame('axel');
  const first = g.currentTurnPlayerId();
  clock.t += 30_000;
  assert.equal(g.expireTurn(), true);
  assert.equal(g.round.stayedFirstPhase.has(first), true);
  assert.equal(g.drainEvents().some((e) => e.type === 'timeout' && e.playerId === first && e.action === 'stay'), true);

  clock.t += 30_000;
  g.expireTurn();                       // andra spelaren: STAY -> alla stannade -> FINAL_SLASK
  assert.equal(g.phase, PHASE.FINAL_SLASK);
  const p = g.currentTurnPlayerId();
  clock.t += 30_000;
  g.expireTurn();
  assert.notEqual(g.currentTurnPlayerId(), p, 'PASS flyttade turen');
});

test('[A1] timeout i stickspelet spelar lägsta kortet vid utspel och lägsta N vid följ', () => {
  const clock = { t: 0 };
  const g = new GurschGame({ id: 'T', rng: seededRng(1), now: () => clock.t, settings: { turnSeconds: 20 } });
  g.addPlayer({ id: 'axel', nickname: 'Axel' });
  g.addPlayer({ id: 'erik', nickname: 'Erik' });
  const r = rigRound(g, { axel: hand('K', '4', '9'), erik: hand('Q', '3', '3') }, 'axel');
  g.refreshTurnTimer();

  clock.t += 20_000;
  g.expireTurn();
  assert.deepEqual(r.currentTrick.plays[0].cards.map((c) => c.rank), [4], 'utspel: ensamt lägsta kort');

  // Erik följer med ett kort manuellt, Axel vinner inte - nästa stick leds av Erik
  g.handleAction('erik', { type: 'play', cardIds: [r.hands.get('erik')[0].id] });
  assert.equal(r.tricks.length, 1);
  const leader = g.currentTurnPlayerId();
  g.handleAction(leader, { type: 'play', cardIds: r.hands.get(leader).slice(0, 2).map((c) => c.id) });
  const other = g.currentTurnPlayerId();
  const expected = r.hands.get(other).map((c) => c.rank).sort((a, b) => a - b).slice(0, 2);
  clock.t += 20_000;
  g.expireTurn();
  const played = r.tricks.at(-1).plays.find((p) => p.playerId === other).cards.map((c) => c.rank).sort((a, b) => a - b);
  assert.deepEqual(played, expected, 'följ: exakt så många kort som utspelet, de lägsta');
});

test('[A1] [R18] ingen turtimer under slaskfönstret, ny deadline efteråt', () => {
  const { g, clock } = timedGame(['Axel', 'Erik']);
  g.startGame('axel');
  const p = g.currentTurnPlayerId();
  g.handleAction(p, { type: 'slask' });
  assert.equal(g.turnDeadline, null);
  assert.equal(g.expireTurn(), false);
  clock.t += 5_000;
  g.resolveSlask();
  assert.equal(g.turnDeadline, clock.t + 30_000);
});

test('[A1] turtimern kan stängas av', () => {
  const { g } = timedGame(['Axel', 'Erik'], { turnSeconds: 0 });
  g.startGame('axel');
  assert.equal(g.turnDeadline, null);
  assert.equal(g.expireTurn(), false);
});

test('[A1] ingen turtimer när rundan är klar', () => {
  const { g } = timedGame(['Axel', 'Erik']);
  const r = rigRound(g, { axel: hand('K'), erik: hand('2') }, 'axel');
  g.handleAction('axel', { type: 'play', cardIds: [r.hands.get('axel')[0].id] });
  g.handleAction('erik', { type: 'play', cardIds: [r.hands.get('erik')[0].id] });
  assert.equal(g.phase, PHASE.ROUND_RESULT);
  assert.equal(g.turnDeadline, null);
});
