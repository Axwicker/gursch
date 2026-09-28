import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE } from '../src/engine/game.js';
import { makeGame } from './helpers.js';

/** Går direkt till sista slaskchansen: alla säger STAY i första slängrundan. */
function toFinalSlask(names, settings = {}) {
  const g = makeGame(names, settings);
  g.startGame(g.players[0].id);
  while (g.phase === PHASE.INITIAL_DISCARD) g.handleAction(g.currentTurnPlayerId(), { type: 'stay' });
  return g;
}

test('[R20] sista slaskchansen: alla får i tur SLASK eller PASS med början hos flopvinnaren', () => {
  const g = toFinalSlask(['Axel', 'Erik', 'Leo']);
  assert.equal(g.phase, PHASE.FINAL_SLASK);
  const flop = g.round.flopWinnerId;
  assert.equal(g.currentTurnPlayerId(), flop);
  assert.deepEqual(g.privateState(flop).actions.map((a) => a.type), ['slask', 'pass']);
  const order = [];
  while (g.phase === PHASE.FINAL_SLASK) {
    order.push(g.currentTurnPlayerId());
    g.handleAction(g.currentTurnPlayerId(), { type: 'pass' });
  }
  assert.equal(order.length, 3);
  assert.equal(order[0], flop);
  assert.equal(g.phase, PHASE.TRICK, 'stickspelet börjar efter sista slaskchansen');
});

test('[R20] [R17] den som slaskat max antal gånger hoppas över i sista slaskchansen', () => {
  const g = makeGame(['Axel', 'Erik'], { maxSlasks: 1 });
  g.startGame('axel');
  const first = g.currentTurnPlayerId();
  g.handleAction(first, { type: 'slask' });
  g.resolveSlask();
  while (g.phase === PHASE.INITIAL_DISCARD) g.handleAction(g.currentTurnPlayerId(), { type: 'stay' });
  const seen = [];
  while (g.phase === PHASE.FINAL_SLASK) {
    seen.push(g.currentTurnPlayerId());
    g.handleAction(g.currentTurnPlayerId(), { type: 'pass' });
  }
  assert.equal(seen.includes(first), false);
});

test('[R21] vinnaren av ett stick leder nästa', () => {
  const g = toFinalSlask(['Axel', 'Erik']);
  while (g.phase === PHASE.FINAL_SLASK) g.handleAction(g.currentTurnPlayerId(), { type: 'pass' });
  assert.equal(g.currentTurnPlayerId(), g.round.flopWinnerId, 'flopvinnaren leder första sticket');
  for (let i = 0; i < 2; i++) {
    const pid = g.currentTurnPlayerId();
    g.handleAction(pid, { type: 'play', cardIds: g.legalPlays(g.round, pid).find((c) => c.length === 1).map((c) => c.id) });
  }
  assert.equal(g.currentTurnPlayerId(), g.round.tricks[0].winnerId);
});
