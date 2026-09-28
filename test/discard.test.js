import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE, GameError } from '../src/engine/game.js';
import { makeGame } from './helpers.js';

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

test('[R11] ett draget kort visas face-up, 2-4 kort är face-down', () => {
  const g = makeGame(['Axel', 'Erik']);
  const r = startWithFlopWinner(g, 'axel');
  g.handleAction('axel', { type: 'discard', cardIds: take(g, 'axel', 1) });
  g.handleAction('erik', { type: 'discard', cardIds: take(g, 'erik', 1) });
  assert.equal(r.visible.get('axel').size, 2, 'ursprungligt face-up + det nya kortet');
  const g2 = makeGame(['Axel', 'Erik']);
  const r2 = startWithFlopWinner(g2, 'axel');
  g2.handleAction('axel', { type: 'discard', cardIds: take(g2, 'axel', 3) });
  g2.handleAction('erik', { type: 'discard', cardIds: take(g2, 'erik', 3) });
  assert.ok(r2.visible.get('axel').size <= 1, 'inga nya face-up-kort vid 3 dragna');
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
