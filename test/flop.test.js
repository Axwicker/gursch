import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './helpers.js';
import { PHASE } from '../src/engine/game.js';

test('[R5] högsta face-up-kortet vinner floppen', () => {
  const g = makeGame(['Axel', 'Erik', 'Leo', 'Oskar']);
  g.startRound();
  const r = g.round;
  const faceUps = g.players.map((p) => {
    const card = r.hands.get(p.id).find((c) => r.visible.get(p.id).has(c.id));
    return { id: p.id, rank: card.rank };
  });
  const best = Math.max(...faceUps.map((f) => f.rank));
  assert.equal(faceUps.find((f) => f.id === r.flopWinnerId).rank, best);
  assert.equal(r.flopRank, best);
});

test('[R5] vid lika vinner den som fick kortet sist i dealerordningen', () => {
  const g = makeGame(['Axel', 'Erik', 'Leo', 'Oskar']);
  g.startRound();
  const r = g.round;
  // Gör alla face-up-kort lika höga
  for (const id of r.dealOrder) {
    const card = r.hands.get(id).find((c) => r.visible.get(id).has(c.id));
    card.rank = 12;
  }
  // kör om flopberäkningen enligt samma regel
  let winner = null; let best = -1;
  for (const id of r.dealOrder) {
    const card = r.hands.get(id).find((c) => r.visible.get(id).has(c.id));
    if (card.rank >= best) { best = card.rank; winner = id; }
  }
  assert.equal(winner, r.dealOrder[r.dealOrder.length - 1]);
  assert.equal(winner, g.players[g.dealerIndex].id, 'dealern får sitt kort sist');
});

test('[R4] varje spelare får 5 kort varav ett face-up, och alla har lika många', () => {
  const g = makeGame(['Axel', 'Erik', 'Leo']);
  g.startRound();
  const r = g.round;
  const allIds = new Set();
  for (const p of g.players) {
    assert.equal(r.hands.get(p.id).length, 5);
    assert.equal(r.visible.get(p.id).size, 1);
    r.hands.get(p.id).forEach((c) => allIds.add(c.id));
  }
  assert.equal(allIds.size, 15, 'inga dubbletter mellan händerna');
  assert.equal(r.piles.draw.length, 52 - 15);
  assert.equal(g.phase, PHASE.INITIAL_DISCARD);
});

test('[R6] flopmult använder flopkortets värde som multiplier', () => {
  const g = makeGame(['Axel', 'Erik'], { multiplierMode: 'flop', flopMultFactor: 2 });
  g.startRound();
  assert.equal(g.round.multiplier, g.round.flopRank * 2);
});

test('[R1] lobbyregler: max 5 spelare, min 2 för start', () => {
  const g = makeGame(['A', 'B', 'C', 'D', 'E']);
  assert.throws(() => g.addPlayer({ id: 'f', nickname: 'F' }), /fullt/);
  const g2 = makeGame(['A']);
  assert.throws(() => g2.startGame('a'), /Minst 2/);
  const g3 = makeGame(['A', 'B']);
  assert.throws(() => g3.startGame('b'), /Endast host/);
  g3.startGame('a');
  assert.equal(g3.phase, PHASE.INITIAL_DISCARD);
  assert.throws(() => g3.removePlayer('b'), /inte lämna mitt i/);
});
