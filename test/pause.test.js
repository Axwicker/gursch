// Paus medan någon skriver en felrapport: allt står still och fortsätter med samma tid kvar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GurschGame, PHASE } from '../src/engine/game.js';
import { seededRng } from './helpers.js';

function setup(settings = {}) {
  const clock = { t: 1_000_000 };
  const g = new GurschGame({ id: 'P', rng: seededRng(4), now: () => clock.t, settings: { turnSeconds: 30, ...settings } });
  g.addPlayer({ id: 'axel', nickname: 'Axel' });
  g.addPlayer({ id: 'erik', nickname: 'Erik' });
  g.addPlayer({ id: 'bot', nickname: 'Bot', isBot: true });
  g.startGame('axel');
  return { g, clock };
}

test('[A6] under pausen går inga drag, men chatten fungerar', () => {
  const { g } = setup();
  const turn = g.currentTurnPlayerId();
  g.pause('erik');
  assert.throws(() => g.handleAction(turn, { type: 'stay' }), /pausat – Erik skriver en felrapport/);
  assert.deepEqual(g.privateState(turn).actions, []);
  assert.equal(g.publicState().paused.playerId, 'erik');
  g.addChat('axel', 'vad hände?');
  g.resume('erik');
  g.handleAction(turn, { type: 'stay' });
});

test('[A6] turtimern står still: efter pausen finns samma tid kvar', () => {
  const { g, clock } = setup();
  clock.t += 10_000;                                    // 20 s kvar av 30
  const left = g.turnDeadline - clock.t;
  g.pause('axel');
  clock.t += 120_000;                                   // två minuter paus
  assert.equal(g.tick(), false, 'inget händer under pausen');
  assert.equal(g.nextWakeup(), g.paused.until, 'enda väckningen är säkerhetsspärren');
  g.resume('axel');
  assert.equal(g.turnDeadline - clock.t, left);
});

test('[A6] förhandlingens timer och bekräftelse, och kortvalets timer, flyttas fram', () => {
  const { g, clock } = setup();
  while (g.phase === PHASE.INITIAL_DISCARD) {
    const pid = g.currentTurnPlayerId();
    g.handleAction(pid, { type: 'discard', cardIds: [g.round.hands.get(pid)[0].id] });
  }
  const n = g.round.negotiation;
  for (const id of n.participants) g.handleAction(id, { type: 'propose', count: 1 });
  const before = { deadline: n.deadline - clock.t, confirmAt: n.confirmAt - clock.t };
  g.pause('axel');
  clock.t += 50_000;
  g.resume('axel');
  assert.equal(n.deadline - clock.t, before.deadline);
  assert.equal(n.confirmAt - clock.t, before.confirmAt);
  clock.t = n.confirmAt;
  g.tick();
  assert.equal(g.phase, PHASE.DISCARD_SELECT);
  const selLeft = g.round.discardSelect.deadline - clock.t;
  g.pause('axel');
  clock.t += 7_000;
  g.resume('axel');
  assert.equal(g.round.discardSelect.deadline - clock.t, selLeft);
});

test('[A6] [R18] slaskfönstret står still under pausen och stängs sedan av timern', () => {
  const { g, clock } = setup();
  const pid = g.currentTurnPlayerId();
  g.handleAction(pid, { type: 'slask' });
  assert.equal(g.nextWakeup(), g.pendingSlask.deadline, 'slaskfönstret går via den gemensamma timern');
  clock.t += 3_000;
  const left = g.pendingSlask.deadline - clock.t;
  g.pause('axel');
  clock.t += 60_000;
  assert.equal(g.tick(), false);
  assert.ok(g.pendingSlask, 'fönstret är fortfarande öppet');
  g.resume('axel');
  assert.equal(g.pendingSlask.deadline - clock.t, left);
  clock.t = g.pendingSlask.deadline;
  assert.equal(g.tick(), true, 'ingen synade - fönstret stängs');
  assert.equal(g.pendingSlask, null);
});

test('[A6] pausen släpper av sig själv efter 3 minuter', () => {
  const { g, clock } = setup();
  g.pause('erik');
  clock.t += 3 * 60 * 1000 - 1;
  assert.equal(g.tick(), false);
  clock.t += 1;
  assert.equal(g.tick(), true);
  assert.equal(g.paused, null);
  assert.equal(g.drainEvents().some((e) => e.type === 'resumed' && e.auto), true);
});

test('[A6] bara den som pausade kan fortsätta; bottar kan inte pausa; ingen dubbelpaus', () => {
  const { g } = setup();
  assert.throws(() => g.pause('bot'), /bot kan inte/);
  g.pause('erik');
  assert.throws(() => g.pause('axel'), /Erik har redan pausat/);
  assert.throws(() => g.resume('axel'), /Bara den som pausade/);
  assert.equal(g.resume('axel', { force: true }), true, 'servern kan tvinga (t.ex. vid frånkoppling)');
});

test('[A6] ingen paus i lobbyn eller när rundan är klar', () => {
  const g = new GurschGame({ id: 'L', rng: seededRng(1) });
  g.addPlayer({ id: 'a', nickname: 'A' });
  g.addPlayer({ id: 'b', nickname: 'B' });
  assert.throws(() => g.pause('a'), /Ingen runda pågår/);
});
