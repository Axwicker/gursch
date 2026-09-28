import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE } from '../src/engine/game.js';
import { makeGame, hand } from './helpers.js';
import { calculateSlaskPayment } from '../src/engine/money.js';

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

test('[R19] slaskbetalning: 10 kr per face card till synaren', () => {
  const res = calculateSlaskPayment({ slaskerId: 'leo', callerId: 'erik', oldHand: hand('5', '5', '9', '10', 'J') });
  assert.equal(res.faceCards, 1);
  assert.equal(res.amount, 10);
  assert.deepEqual(res.txs.map((t) => [t.playerId, t.amount]), [['leo', -10], ['erik', 10]]);
});

test('[R19] slaskbetalning: utan face cards betalar synaren 25 kr', () => {
  const res = calculateSlaskPayment({ slaskerId: 'leo', callerId: 'erik', oldHand: hand('5', '5', '9', '10', '2') });
  assert.equal(res.faceCards, 0);
  assert.deepEqual(res.txs.map((t) => [t.playerId, t.amount]), [['erik', -25], ['leo', 25]]);
});

test('[R17] [R19] Leo slaskar 5,5,9,10,J - Erik synar - Leo betalar 10 kr och får ny hand', () => {
  const g = makeGame(['Axel', 'Erik', 'Leo', 'Oskar']);
  const r = startWithFlopWinner(g, 'leo');
  r.hands.set('leo', hand('5', '5', '9', '10', 'J'));
  r.visible.set('leo', new Set());
  const oldIds = r.hands.get('leo').map((c) => c.id);

  g.handleAction('leo', { type: 'slask' });
  assert.equal(g.pendingSlask.playerId, 'leo');
  g.handleAction('erik', { type: 'callSlask' });

  assert.equal(g.player('leo').balance, -10);
  assert.equal(g.player('erik').balance, 10);
  const newHand = r.hands.get('leo');
  assert.equal(newHand.length, 5);
  assert.equal(newHand.some((c) => oldIds.includes(c.id)), false, 'helt ny hand');
  assert.equal(g.history.length, 2);
  assert.equal(g.history[0].event, 'Slask');
});

test('[R18] endast en spelare får syna (race condition)', () => {
  const g = makeGame(['Axel', 'Erik', 'Leo', 'Oskar']);
  startWithFlopWinner(g, 'leo');
  g.round.hands.set('leo', hand('5', '5', '9', '10', 'J'));
  g.handleAction('leo', { type: 'slask' });
  g.handleAction('erik', { type: 'callSlask' });
  assert.throws(() => g.handleAction('oskar', { type: 'callSlask' }), /SLASK ALREADY CALLED|Ingen slask/);
  assert.equal(g.player('oskar').balance, 0);
});

test('[R18] man kan inte syna sin egen slask', () => {
  const g = makeGame(['Axel', 'Erik']);
  startWithFlopWinner(g, 'axel');
  g.handleAction('axel', { type: 'slask' });
  assert.throws(() => g.handleAction('axel', { type: 'callSlask' }), /egen slask/);
});

test('[R19] osynad slask ger ingen betalning men ny hand', () => {
  const g = makeGame(['Axel', 'Erik']);
  const r = startWithFlopWinner(g, 'axel');
  g.handleAction('axel', { type: 'slask' });
  g.resolveSlask();   // timeout utan synare
  assert.equal(g.player('axel').balance, 0);
  assert.equal(r.hands.get('axel').length, 5);
  assert.equal(g.currentTurnPlayerId(), 'axel', 'man väljer igen på sin nya hand');
});

test('[R17] efter en slask i första slängrundan väljer man igen: slaska igen, slänga eller STAY', () => {
  const g = makeGame(['Axel', 'Erik'], { maxSlasks: 3 });
  const r = startWithFlopWinner(g, 'axel');
  g.handleAction('axel', { type: 'slask' });
  g.resolveSlask();
  assert.deepEqual(g.privateState('axel').actions.map((a) => a.type), ['discard', 'stay', 'slask']);
  g.handleAction('axel', { type: 'slask' });
  g.resolveSlask();
  g.handleAction('axel', { type: 'slask' });
  g.resolveSlask();
  assert.equal(g.player('axel').slasks, 3);
  assert.deepEqual(g.privateState('axel').actions.map((a) => a.type), ['discard', 'stay'], 'max nått: bara slänga eller STAY');
  g.handleAction('axel', { type: 'discard', cardIds: r.hands.get('axel').slice(0, 2).map((c) => c.id) });
  assert.equal(g.currentTurnPlayerId(), 'erik');
  assert.equal(g.requiredDiscardCount(), 2, 'den som slaskade kan fortfarande bestämma antalet');
});

test('[R17] [R20] i sista slaskchansen kan man slaska flera gånger i rad, sedan PASS', () => {
  const g = makeGame(['Axel', 'Erik'], { maxSlasks: 2 });
  startWithFlopWinner(g, 'axel');
  while (g.phase === PHASE.INITIAL_DISCARD) g.handleAction(g.currentTurnPlayerId(), { type: 'stay' });
  assert.equal(g.phase, PHASE.FINAL_SLASK);
  const first = g.currentTurnPlayerId();
  g.handleAction(first, { type: 'slask' });
  g.resolveSlask();
  assert.equal(g.currentTurnPlayerId(), first, 'samma spelare väljer igen');
  assert.deepEqual(g.privateState(first).actions.map((a) => a.type), ['slask', 'pass']);
  g.handleAction(first, { type: 'slask' });
  g.resolveSlask();
  assert.notEqual(g.currentTurnPlayerId(), first, 'max nått: turen går vidare av sig själv');
});

test('[R17] maxgränsen för slask respekteras', () => {
  const g = makeGame(['Axel', 'Erik'], { maxSlasks: 2 });
  startWithFlopWinner(g, 'axel');
  for (let i = 0; i < 2; i++) {
    g.round.turnIndex = 0;   // tillbaka till Axel
    g.round.decisions.delete('axel');
    g.handleAction('axel', { type: 'slask' });
    g.resolveSlask();
  }
  g.round.turnIndex = 0;
  g.round.decisions.delete('axel');
  assert.throws(() => g.handleAction('axel', { type: 'slask' }), /Max 2 slaskar/);
  assert.equal(g.player('axel').slasks, 2);
});

test('[R18] slask blockerar andra actions tills fönstret stängs', () => {
  const g = makeGame(['Axel', 'Erik', 'Leo']);
  startWithFlopWinner(g, 'axel');
  g.handleAction('axel', { type: 'slask' });
  assert.throws(() => g.handleAction('erik', { type: 'stay' }), /slaskfönstret/);
  assert.equal(g.phase, PHASE.INITIAL_DISCARD);
});
