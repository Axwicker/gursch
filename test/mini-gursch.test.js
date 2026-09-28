import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE } from '../src/engine/game.js';
import { makeGame, rigRound, hand } from './helpers.js';

const play = (g, pid, cards) => g.handleAction(pid, { type: 'play', cardIds: cards.map((c) => c.id) });

/** Tvingar fram en tie mellan Axel och Erik (14 vardera), Leo 6. */
function setupTie(settings = {}) {
  const g = makeGame(['Axel', 'Erik', 'Leo'], { multiplierValue: 10, ...settings });
  const r = rigRound(g, {
    axel: hand('Q', '2'),   // mixed 14
    erik: hand('8', '6'),   // mixed 14
    leo: hand('3', '3'),    // clean 6
  }, 'leo');
  r.multiplier = 10;
  play(g, 'leo', r.hands.get('leo').slice());
  play(g, 'axel', r.hands.get('axel').slice());
  play(g, 'erik', r.hands.get('erik').slice());
  return g;
}

test('[R29] lika högsta slutvärde startar mini-gursch mellan de tie:ade spelarna', () => {
  const g = setupTie();
  assert.equal(g.phase, PHASE.MINI_GURSCH);
  const mini = g.round.mini;
  assert.deepEqual(mini.participants.slice().sort(), ['axel', 'erik']);
  assert.equal(mini.level, 1);
  assert.equal(mini.tiedValue, 14);
});

test('[R29] mini-gursch delar 3 kort och det tredje är face-up', () => {
  const g = setupTie();
  const mini = g.round.mini;
  for (const id of mini.participants) {
    assert.equal(mini.hands.get(id).length, 3);
    assert.equal(mini.visible.get(id).size, 1, 'endast tredje kortet är face-up');
    const faceUpId = [...mini.visible.get(id)][0];
    assert.equal(mini.hands.get(id)[2].id, faceUpId, 'det tredje kortet');
  }
  assert.ok(mini.participants.includes(mini.starterId));
});

test('[R29] mini-gursch multiplicerar multipliern med antalet deltagare', () => {
  const g = setupTie();
  assert.equal(g.round.multiplier, 10);
  assert.equal(g.round.mini.multiplier, 20, '10 x 2 deltagare');
});

test('[R30] mini-gursch avgör losern och betalningen använder rundans slutvärde', () => {
  const g = setupTie();
  const mini = g.round.mini;
  // Rigga mini-händerna: startaren har K, motståndaren A
  const [a, b] = [mini.starterId, mini.participants.find((id) => id !== mini.starterId)];
  mini.hands.set(a, hand('K'));
  mini.hands.set(b, hand('A'));
  mini.visible.set(a, new Set());
  mini.visible.set(b, new Set());
  g.startTrick(mini, a);
  play(g, a, mini.hands.get(a).slice());
  play(g, b, mini.hands.get(b).slice());

  assert.equal(g.phase, PHASE.ROUND_RESULT);
  assert.equal(g.result.loserId, b, 'högst slutvärde i mini-gursch (A=14) blir loser');
  assert.equal(g.result.multiplier, 20);
  assert.equal(g.result.loserValue, 14, 'rundans tie-värde');
  const byId = Object.fromEntries(g.result.players.map((p) => [p.id, p]));
  assert.equal(byId[b].change, -14 * 20 * 2);
  assert.equal(byId.leo.change, 280);
  assert.equal(g.result.miniLevel, 1);
});

test('[R31] fortsatt lika startar mini-mini-gursch med ny multiplier', () => {
  const g = setupTie();
  const mini = g.round.mini;
  const [a, b] = mini.participants;
  mini.hands.set(a, hand('K'));
  mini.hands.set(b, hand('K'));
  mini.visible.set(a, new Set());
  mini.visible.set(b, new Set());
  g.startTrick(mini, a);
  play(g, a, mini.hands.get(a).slice());
  play(g, b, mini.hands.get(b).slice());

  assert.equal(g.phase, PHASE.MINI_GURSCH);
  assert.equal(g.round.mini.level, 2);
  assert.equal(g.round.mini.multiplier, 40, '20 x 2 deltagare');
  assert.equal(g.round.miniHistory.length, 1);
});

test('[R31] mini-gursch-cap stoppar kedjan', () => {
  const g = setupTie({ miniGurschCap: 1 });
  const mini = g.round.mini;
  const [a, b] = mini.participants;
  mini.hands.set(a, hand('K'));
  mini.hands.set(b, hand('K'));
  mini.visible.set(a, new Set());
  mini.visible.set(b, new Set());
  g.startTrick(mini, a);
  play(g, a, mini.hands.get(a).slice());
  play(g, b, mini.hands.get(b).slice());
  assert.equal(g.phase, PHASE.ROUND_RESULT);
  assert.equal(g.result.capReached, true);
  assert.equal(g.result.multiplier, 20, 'senast giltiga multiplier');
});

test('[R4] mini-gursch påverkar inte dealerordningen', () => {
  const g = setupTie();
  const mini = g.round.mini;
  const [a, b] = mini.participants;
  mini.hands.set(a, hand('K'));
  mini.hands.set(b, hand('A'));
  g.startTrick(mini, a);
  play(g, a, mini.hands.get(a).slice());
  play(g, b, mini.hands.get(b).slice());
  const before = g.dealerIndex;
  g.nextRound(g.hostId);
  assert.equal(g.dealerIndex, (before + 1) % 3);
});
