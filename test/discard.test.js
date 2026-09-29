import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE, GameError, GurschGame, REVEAL_MS } from '../src/engine/game.js';
import { makeGame, seededRng } from './helpers.js';

function startWithFlopWinner(game, winnerId) {
  game.startRound();
  const r = game.round;
  r.flopWinnerId = winnerId;
  r.turnOrder = game.rotate(game.players.map((p) => p.id), game.indexOf(winnerId));
  r.turnIndex = 0;
  r.proposal = { count: null, proposerId: winnerId };
  game.drainEvents();
  return r;
}

const ids = (g) => g.players.map((p) => p.id);
const take = (g, pid, n) => g.round.hands.get(pid).slice(0, n).map((c) => c.id);

test('[R9] flopvinnaren bestämmer antalet i första slängrundan', () => {
  const g = makeGame(['Axel', 'Erik', 'Leo', 'Oskar']);
  startWithFlopWinner(g, 'axel');
  assert.equal(g.currentTurnPlayerId(), 'axel');
  g.handleAction('axel', { type: 'discard', cardIds: take(g, 'axel', 3) });
  assert.equal(g.requiredDiscardCount(), 3);
  // Erik kan inte välja ett annat antal
  assert.throws(() => g.handleAction('erik', { type: 'discard', cardIds: take(g, 'erik', 2) }), GameError);
  g.handleAction('erik', { type: 'discard', cardIds: take(g, 'erik', 3) });
});

test('[A3] fel spelare kan inte agera', () => {
  const g = makeGame(['Axel', 'Erik']);
  startWithFlopWinner(g, 'axel');
  assert.throws(() => g.handleAction('erik', { type: 'stay' }), /inte din tur/);
});

test('[R9] [R10] STAY i första fasen påverkar inte de andras val och ger skip i första förhandlingen', () => {
  const g = makeGame(['Axel', 'Erik', 'Leo', 'Oskar']);
  const r = startWithFlopWinner(g, 'axel');
  g.handleAction('axel', { type: 'discard', cardIds: take(g, 'axel', 3) });
  g.handleAction('erik', { type: 'stay' });
  assert.equal(r.stayedFirstPhase.has('erik'), true);
  // Leo och Oskar slänger fortfarande 3
  g.handleAction('leo', { type: 'discard', cardIds: take(g, 'leo', 3) });
  g.handleAction('oskar', { type: 'discard', cardIds: take(g, 'oskar', 3) });
  // dragningen har genomförts -> förhandling där Erik står över
  assert.equal(g.phase, PHASE.NEGOTIATION);
  assert.equal(g.round.discardRound, 2);
  assert.equal(g.round.negotiation.participants.includes('erik'), false);
  for (const id of ids(g)) assert.equal(g.round.hands.get(id).length, 5, 'alla har alltid 5 kort');
});

/** Spel med styrbar klocka (för REVEAL_MS och pausen). */
function clockedGame(names) {
  const clock = { t: 1_000_000 };
  const g = new GurschGame({ id: 'TEST', settings: {}, rng: seededRng(42), now: () => clock.t });
  for (const n of names) g.addPlayer({ id: n.toLowerCase(), nickname: n });
  return { g, clock };
}
const visibleIds = (g, pid) => g.publicState().players.find((p) => p.id === pid).visibleCards.map((c) => c.id);

test('[R5] floppkortet syns under första slängrundan och göms när den är slut', () => {
  const g = makeGame(['Axel', 'Erik']);
  const r = startWithFlopWinner(g, 'axel');
  const flopCard = [...r.visible.get('erik')][0];
  assert.ok(flopCard, 'Erik har ett uppvänt floppkort');
  g.handleAction('axel', { type: 'discard', cardIds: take(g, 'axel', 3) });
  assert.deepEqual(visibleIds(g, 'erik'), [flopCard], 'syns medan första slängrundan pågår');
  g.handleAction('erik', { type: 'discard', cardIds: take(g, 'erik', 3) });
  assert.equal(g.phase, PHASE.NEGOTIATION);
  assert.deepEqual(visibleIds(g, 'erik'), [], 'göms när förhandlingen börjar');
  assert.deepEqual(visibleIds(g, 'axel'), []);
});

test('[R11] ett ensamt draget kort syns i REVEAL_MS och göms sedan; 2-4 dragna kort är dolda', () => {
  const { g, clock } = clockedGame(['Axel', 'Erik']);
  const r = startWithFlopWinner(g, 'axel');
  const erikHandBefore = new Set(r.hands.get('erik').map((c) => c.id));
  g.handleAction('axel', { type: 'discard', cardIds: take(g, 'axel', 1) });
  g.handleAction('erik', { type: 'discard', cardIds: take(g, 'erik', 1) });
  const shown = visibleIds(g, 'erik');
  assert.equal(shown.length, 1, 'bara det nydragna kortet - inte floppkortet');
  assert.equal(erikHandBefore.has(shown[0]), false, 'det uppvända kortet är det som drogs');
  assert.equal(g.nextWakeup(), clock.t + REVEAL_MS, 'servern väcks när kortet ska gömmas');
  clock.t += REVEAL_MS - 1;
  g.tick();
  assert.equal(visibleIds(g, 'erik').length, 1, 'syns fortfarande strax innan');
  clock.t += 1;
  assert.equal(g.tick(), true, 'tick() rapporterar ändringen så att servern skickar ut den');
  assert.deepEqual(visibleIds(g, 'erik'), []);
  assert.equal(g.phase, PHASE.NEGOTIATION, 'att gömma kortet påverkar inte spelet');

  const g2 = makeGame(['Axel', 'Erik']);
  startWithFlopWinner(g2, 'axel');
  g2.handleAction('axel', { type: 'discard', cardIds: take(g2, 'axel', 3) });
  g2.handleAction('erik', { type: 'discard', cardIds: take(g2, 'erik', 3) });
  assert.deepEqual(visibleIds(g2, 'axel'), [], 'inga uppvända kort vid 3 dragna');
});

test('[R11] ett draget kort syns aldrig rundan efter eller i stickspelet', () => {
  const { g } = clockedGame(['Axel', 'Erik']);
  startWithFlopWinner(g, 'axel');
  g.handleAction('axel', { type: 'discard', cardIds: take(g, 'axel', 1) });
  g.handleAction('erik', { type: 'discard', cardIds: take(g, 'erik', 1) });
  assert.equal(visibleIds(g, 'erik').length, 1);
  g.handleAction('erik', { type: 'stay' });   // STAY avslutar förhandlingen direkt, inom REVEAL_MS
  assert.equal(g.phase, PHASE.FINAL_SLASK);
  assert.deepEqual(visibleIds(g, 'erik'), [], 'göms när slängningen är slut');
  assert.equal(g.round.revealUntil, null);
});

test('[R11] [A6] pausen flyttar fram tiden då det dragna kortet göms', () => {
  const { g, clock } = clockedGame(['Axel', 'Erik']);
  startWithFlopWinner(g, 'axel');
  g.handleAction('axel', { type: 'discard', cardIds: take(g, 'axel', 1) });
  g.handleAction('erik', { type: 'discard', cardIds: take(g, 'erik', 1) });
  clock.t += 1000;
  g.pause('axel');
  clock.t += 60_000;
  g.resume('axel');
  clock.t += REVEAL_MS - 1000 - 1;
  g.tick();
  assert.equal(visibleIds(g, 'erik').length, 1, 'pausen räknas inte');
  clock.t += 1;
  g.tick();
  assert.deepEqual(visibleIds(g, 'erik'), []);
});

test('[R9] kortvalet kan ändras innan bekräftelse (endast bekräftat val registreras)', () => {
  const g = makeGame(['Axel', 'Erik']);
  startWithFlopWinner(g, 'axel');
  const chosen = take(g, 'axel', 2);
  assert.equal(g.round.decisions.has('axel'), false);
  g.handleAction('axel', { type: 'discard', cardIds: chosen });
  assert.deepEqual(g.round.decisions.get('axel').cardIds, chosen);
});

test('[A3] man kan inte slänga kort man inte äger', () => {
  const g = makeGame(['Axel', 'Erik']);
  startWithFlopWinner(g, 'axel');
  assert.throws(() => g.handleAction('axel', { type: 'discard', cardIds: ['FAKE1'] }), /äger inte/);
});
