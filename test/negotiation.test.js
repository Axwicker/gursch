// Slängförhandlingen efter första slängrundan: alla föreslår samtidigt 1-4 kort i realtid.
// Är alla överens (i 2 s) väljer alla sina kort och drar - sedan ny förhandling.
// STAY eller ingen enighet när tiden tar slut => inga kort slängs och spelet börjar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GurschGame, PHASE, GameError } from '../src/engine/game.js';
import { seededRng } from './helpers.js';

function setup(names = ['Axel', 'Erik', 'Leo'], settings = {}) {
  const clock = { t: 1_000_000 };
  const g = new GurschGame({ id: 'N', rng: seededRng(3), now: () => clock.t, settings: { turnSeconds: 30, ...settings } });
  for (const n of names) g.addPlayer({ id: n.toLowerCase(), nickname: n });
  g.startGame(g.players[0].id);
  return { g, clock };
}

/** Spelar första slängrundan. choices: id -> 'stay' | antal kort (samma för alla som slänger). */
function firstDiscardRound(g, choices = {}) {
  while (g.phase === PHASE.INITIAL_DISCARD) {
    const pid = g.currentTurnPlayerId();
    const choice = choices[pid] ?? 2;
    if (choice === 'stay') g.handleAction(pid, { type: 'stay' });
    else g.handleAction(pid, { type: 'discard', cardIds: g.round.hands.get(pid).slice(0, g.requiredDiscardCount() ?? choice).map((c) => c.id) });
  }
}

const handIds = (g) => Object.fromEntries(g.players.map((p) => [p.id, g.round.hands.get(p.id).map((c) => c.id).join()]));
const proposeAll = (g, count) => { for (const id of g.round.negotiation.participants) g.handleAction(id, { type: 'propose', count }); };

test('[R13] efter första slängrundan börjar en förhandling där alla föreslår samtidigt', () => {
  const { g, clock } = setup();
  firstDiscardRound(g);
  assert.equal(g.phase, PHASE.NEGOTIATION);
  const n = g.publicState().negotiation;
  assert.deepEqual(n.participants.slice().sort(), ['axel', 'erik', 'leo']);
  assert.deepEqual(Object.values(n.proposals), [null, null, null]);
  assert.equal(n.deadline, clock.t + 20_000, 'standard 20 s');
  assert.equal(g.currentTurnPlayerId(), null, 'ingen tur - alla agerar samtidigt');
  for (const id of ['axel', 'erik', 'leo']) {
    assert.deepEqual(g.privateState(id).actions.map((a) => a.type), ['propose', 'stay']);
  }
});

test('[R13] förslagen syns för alla i realtid och kan ändras', () => {
  const { g } = setup();
  firstDiscardRound(g);
  g.handleAction('leo', { type: 'propose', count: 3 });
  assert.equal(g.publicState().negotiation.proposals.leo, 3);
  g.handleAction('leo', { type: 'propose', count: 1 });
  assert.equal(g.publicState().negotiation.proposals.leo, 1);
  assert.throws(() => g.handleAction('leo', { type: 'propose', count: 5 }), /1-4/);
  assert.throws(() => g.handleAction('leo', { type: 'propose', count: 0 }), /1-4/);
});

test('[R14] [R11] alla överens: efter 2 s bekräftelse väljer alla sina kort och drar - sedan ny förhandling', () => {
  const { g, clock } = setup();
  firstDiscardRound(g);
  proposeAll(g, 3);
  const n = g.publicState().negotiation;
  assert.equal(n.agreedCount, 3);
  assert.equal(n.confirmAt, clock.t + 2000);
  clock.t += 1999;
  assert.equal(g.tick(), false, 'bekräftelsen är inte klar än');
  clock.t += 1;
  assert.equal(g.tick(), true);
  assert.equal(g.phase, PHASE.DISCARD_SELECT);
  assert.equal(g.publicState().discardSelect.count, 3);

  const before = handIds(g);
  const thrown = {};
  for (const id of ['axel', 'erik', 'leo']) {
    thrown[id] = g.round.hands.get(id).slice(0, 3).map((c) => c.id);
    assert.throws(() => g.handleAction(id, { type: 'discard', cardIds: thrown[id].slice(0, 2) }), /exakt 3/);
    g.handleAction(id, { type: 'discard', cardIds: thrown[id] });
  }
  // Alla har nya kort: de slängda korten finns inte kvar i handen (felet "samma kort tillbaka")
  for (const id of ['axel', 'erik', 'leo']) {
    const hand = g.round.hands.get(id).map((c) => c.id);
    assert.equal(hand.length, 5);
    assert.notEqual(hand.join(), before[id]);
    assert.equal(thrown[id].some((c) => hand.includes(c)), false);
  }
  assert.equal(g.phase, PHASE.NEGOTIATION, 'ny förhandling');
  assert.equal(g.publicState().negotiation.number, 2);
});

test('[R14] ändrar någon sig under bekräftelsen avbryts den', () => {
  const { g, clock } = setup();
  firstDiscardRound(g);
  proposeAll(g, 2);
  clock.t += 1000;
  g.handleAction('erik', { type: 'propose', count: 3 });
  assert.equal(g.publicState().negotiation.confirmAt, null);
  clock.t += 5000;
  g.tick();
  assert.equal(g.phase, PHASE.NEGOTIATION, 'ingen enighet ännu');
});

test('[R15] STAY avslutar förhandlingen direkt: inga kort slängs och spelet börjar', () => {
  const { g } = setup();
  firstDiscardRound(g);
  g.handleAction('axel', { type: 'propose', count: 2 });
  g.handleAction('erik', { type: 'propose', count: 2 });
  const before = handIds(g);
  g.handleAction('leo', { type: 'stay' });
  assert.ok([PHASE.FINAL_SLASK, PHASE.TRICK].includes(g.phase));
  assert.deepEqual(handIds(g), before);
  assert.equal(g.drainEvents().some((e) => e.type === 'stay' && e.endsNegotiation && e.playerId === 'leo'), true);
});

test('[R15] ingen enighet när tiden tar slut: inga kort slängs och spelet börjar', () => {
  const { g, clock } = setup();
  firstDiscardRound(g);
  g.handleAction('axel', { type: 'propose', count: 1 });
  g.handleAction('erik', { type: 'propose', count: 4 });
  const before = handIds(g);
  assert.equal(g.nextWakeup(), g.round.negotiation.deadline);
  clock.t = g.round.negotiation.deadline;
  assert.equal(g.tick(), true);
  assert.ok([PHASE.FINAL_SLASK, PHASE.TRICK].includes(g.phase));
  assert.deepEqual(handIds(g), before);
  assert.equal(g.drainEvents().some((e) => e.type === 'negotiationFailed'), true);
});

test('[R15] en bekräftelse som pågår när tiden tar slut får gå klart', () => {
  const { g, clock } = setup();
  firstDiscardRound(g);
  clock.t = g.round.negotiation.deadline - 500;
  proposeAll(g, 1);
  clock.t += 600;                      // förbi deadline, men bekräftelsen är inte klar
  g.tick();
  assert.equal(g.phase, PHASE.NEGOTIATION);
  clock.t = g.round.negotiation.confirmAt;
  g.tick();
  assert.equal(g.phase, PHASE.DISCARD_SELECT);
});

test('[R10] STAY i första rundan: står över första förhandlingen men är med i nästa', () => {
  const { g, clock } = setup();
  firstDiscardRound(g, { erik: 'stay' });
  const n = g.publicState().negotiation;
  assert.deepEqual(n.participants.includes('erik'), false);
  assert.deepEqual(n.skipped, ['erik']);
  assert.deepEqual(g.privateState('erik').actions, [], 'kan varken föreslå eller säga STAY');
  assert.throws(() => g.handleAction('erik', { type: 'stay' }), /står över/);
  assert.throws(() => g.handleAction('erik', { type: 'propose', count: 2 }), /står över/);

  proposeAll(g, 1);
  clock.t = g.round.negotiation.confirmAt;
  g.tick();
  assert.throws(() => g.handleAction('erik', { type: 'discard', cardIds: [g.round.hands.get('erik')[0].id] }), /slänger inte/);
  for (const id of g.round.discardSelect.participants) {
    g.handleAction(id, { type: 'discard', cardIds: [g.round.hands.get(id)[0].id] });
  }
  assert.equal(g.round.negotiation.participants.includes('erik'), true, 'med igen i nästa förhandling');
});

test('[R10] alla stannade i första rundan: ingen förhandling, spelet börjar', () => {
  const { g } = setup(['Axel', 'Erik']);
  firstDiscardRound(g, { axel: 'stay', erik: 'stay' });
  assert.ok([PHASE.FINAL_SLASK, PHASE.TRICK].includes(g.phase));
});

test('[R16] den som inte hinner välja kort får sina högsta kort slängda', () => {
  const { g, clock } = setup();
  firstDiscardRound(g);
  proposeAll(g, 2);
  clock.t = g.round.negotiation.confirmAt;
  g.tick();
  g.handleAction('axel', { type: 'discard', cardIds: g.round.hands.get('axel').slice(0, 2).map((c) => c.id) });
  const erikHighest = g.round.hands.get('erik').slice().sort((a, b) => b.rank - a.rank).slice(0, 2).map((c) => c.id);
  assert.equal(g.nextWakeup(), g.round.discardSelect.deadline);
  clock.t = g.round.discardSelect.deadline;
  g.tick();
  assert.equal(erikHighest.some((id) => g.round.hands.get('erik').some((c) => c.id === id)), false);
  assert.equal(g.phase, PHASE.NEGOTIATION);
});

test('[A2] kortvalet är hemligt: publikt state visar bara vilka som är klara', () => {
  const { g, clock } = setup();
  firstDiscardRound(g);
  proposeAll(g, 2);
  clock.t = g.round.negotiation.confirmAt;
  g.tick();
  const chosen = g.round.hands.get('axel').slice(0, 2).map((c) => c.id);
  g.handleAction('axel', { type: 'discard', cardIds: chosen });
  const pub = g.publicState();
  assert.deepEqual(pub.discardSelect.done, ['axel']);
  const visible = new Set(pub.players.flatMap((p) => p.visibleCards.map((c) => c.id)));
  for (const id of chosen) {
    if (!visible.has(id)) assert.equal(JSON.stringify(pub).includes(`"${id}"`), false);
  }
  assert.throws(() => g.handleAction('axel', { type: 'discard', cardIds: chosen }), /redan valt/);
});

test('[A3] fel fas och okända drag avvisas', () => {
  const { g } = setup();
  assert.throws(() => g.handleAction(g.currentTurnPlayerId(), { type: 'propose', count: 2 }), GameError);
});

test('[R16] inget tak: 25 förhandlingar i rad där alla är överens fortsätter', () => {
  const { g, clock } = setup(['Axel', 'Erik']);
  firstDiscardRound(g);
  for (let i = 0; i < 25; i++) {
    assert.equal(g.phase, PHASE.NEGOTIATION);
    proposeAll(g, 1);
    clock.t = g.round.negotiation.confirmAt;
    g.tick();
    for (const id of g.round.discardSelect.participants) {
      g.handleAction(id, { type: 'discard', cardIds: [g.round.hands.get(id)[0].id] });
    }
  }
  assert.equal(g.phase, PHASE.NEGOTIATION);
  assert.equal(g.round.negotiation.number, 26);
});

test('[R18] synatiden är 7 s som standard', () => {
  const { g } = setup(['Axel', 'Erik']);
  assert.equal(g.settings.slaskCallSeconds, 7);
});
