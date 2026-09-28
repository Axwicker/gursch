import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateRoundPayments, resolveMultiplier, applyTransactions } from '../src/engine/money.js';
import { makeGame, rigRound, hand } from './helpers.js';

test('[R28] losern betalar slutvärde x multiplier till varje annan spelare', () => {
  const txs = calculateRoundPayments({
    playerIds: ['axel', 'erik', 'leo', 'oskar'], loserId: 'erik', loserValue: 27, multiplier: 10,
  });
  const byId = Object.fromEntries(txs.map((t) => [t.playerId, t.amount]));
  assert.deepEqual(byId, { axel: 270, leo: 270, oskar: 270, erik: -810 });
  assert.equal(txs.reduce((s, t) => s + t.amount, 0), 0, 'nollsumma');
});

test('[R2] alla belopp är heltal och saldon får bli negativa', () => {
  const players = [
    { id: 'a', nickname: 'A', balance: 0 },
    { id: 'b', nickname: 'B', balance: 0 },
  ];
  const txs = calculateRoundPayments({ playerIds: ['a', 'b'], loserId: 'a', loserValue: 33, multiplier: 25 });
  const entries = applyTransactions(players, txs, { round: 1, event: 'Runda' });
  assert.equal(players[0].balance, -825);
  assert.equal(players[1].balance, 825);
  for (const e of entries) assert.ok(Number.isInteger(e.amount));
  assert.equal(entries[entries.length - 1].balanceAfter, -825);
});

test('[R6] multiplier: fast värde och flopmult', () => {
  assert.equal(resolveMultiplier({ multiplierMode: 'fixed', multiplierValue: 25 }, 12), 25);
  assert.equal(resolveMultiplier({ multiplierMode: 'flop', flopMultFactor: 1 }, 12), 12);
  assert.equal(resolveMultiplier({ multiplierMode: 'flop', flopMultFactor: 2 }, 12), 24);
  assert.equal(resolveMultiplier({ multiplierMode: 'flop', flopMultFactor: 3 }, 14), 42);
});

test('[R19] slaskbetalning bokförs separat från rundans resultat', () => {
  const g = makeGame(['Axel', 'Erik'], { multiplierValue: 10 });
  const r = rigRound(g, { axel: hand('K', 'K'), erik: hand('2', '2') }, 'axel');
  r.multiplier = 10;
  // simulera en tidigare slaskbetalning
  r.slaskLog.push({ slaskerId: 'erik', callerId: 'axel', faceCards: 1, amount: 10, hand: ['J'] });
  applyTransactions(g.players, [
    { playerId: 'erik', amount: -10, type: 'slask_payment' },
    { playerId: 'axel', amount: 10, type: 'slask_reward' },
  ], { round: 1, event: 'Slask' }).forEach((e) => g.history.push(e));

  g.handleAction('axel', { type: 'play', cardIds: r.hands.get('axel').map((c) => c.id) });
  g.handleAction('erik', { type: 'play', cardIds: r.hands.get('erik').map((c) => c.id) });

  const byId = Object.fromEntries(g.result.players.map((p) => [p.id, p]));
  assert.equal(g.result.loserId, 'axel', 'K,K = 26 är högst');
  assert.equal(byId.axel.change, -260, 'rundans förändring exkluderar slask');
  assert.equal(byId.axel.balance, -250, 'saldot inkluderar slasken');
  assert.equal(g.result.slaskLog.length, 1);
  assert.equal(g.history.filter((h) => h.event === 'Slask').length, 2);
  assert.equal(g.history.filter((h) => h.event === 'Runda').length, 2);
});
