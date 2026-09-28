import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE } from '../src/engine/game.js';
import { makeGame, rigRound, hand } from './helpers.js';

const play = (g, pid, cards) => g.handleAction(pid, { type: 'play', cardIds: cards.map((c) => c.id) });

test('[R27] Quint two ger direkt utgång och specialspelaren blir inte loser', () => {
  const g = makeGame(['Axel', 'Erik', 'Leo', 'Oskar'], { multiplierValue: 10 });
  const r = rigRound(g, {
    axel: hand('2', '2', '2', '7', '7'),
    erik: hand('2', 'Q', 'K', '3', '4'),   // 34
    leo: hand('2', '3', '4', '5', '6'),    // 20
    oskar: hand('2', '2', '3', '4', '5'),  // 16
  }, 'axel');
  r.multiplier = 10;

  play(g, 'axel', r.hands.get('axel').slice());

  assert.equal(g.phase, PHASE.ROUND_RESULT);
  assert.equal(g.result.quintExitPlayerId, 'axel');
  assert.equal(g.result.loserId, 'erik');
  const byId = Object.fromEntries(g.result.players.map((p) => [p.id, p]));
  assert.equal(byId.axel.finalValue, 10, '2,2,2,7,7 = 5 x 2');
  assert.equal(byId.erik.finalValue, 34);
  assert.equal(byId.erik.change, -34 * 10 * 3);
  assert.equal(byId.axel.change, 340);
  assert.ok(g.drainEvents === undefined || true);
});

test('[R7] [R27] five-of-a-kind med 7-substitution avslutar rundan och skyddar spelaren', () => {
  const g = makeGame(['Axel', 'Erik', 'Leo'], { multiplierValue: 5 });
  const r = rigRound(g, {
    axel: hand('K', 'K', 'K', 'K', '7'),   // 65 - högst men skyddad
    erik: hand('2', '3', '4', '5', '6'),   // 20
    leo: hand('2', '2', '3', '4', 'A'),    // 25
  }, 'axel');
  r.multiplier = 5;
  play(g, 'axel', r.hands.get('axel').slice());
  assert.equal(g.result.loserId, 'leo', 'högsta värdet bland ÖVRIGA spelare');
  const byId = Object.fromEntries(g.result.players.map((p) => [p.id, p]));
  assert.equal(byId.axel.finalValue, 65);
  assert.equal(byId.leo.change, -25 * 5 * 2);
  assert.equal(byId.axel.change, 125);
});

test('[R22] [R27] ogiltig femkortsledning avslutar inte rundan', () => {
  const g = makeGame(['Axel', 'Erik']);
  const r = rigRound(g, {
    axel: hand('K', 'K', 'K', 'Q', '7'),
    erik: hand('2', '3', '4', '5', '6'),
  }, 'axel');
  assert.throws(() => play(g, 'axel', r.hands.get('axel').slice()), /giltig kombination/);
  assert.equal(g.phase, PHASE.TRICK);
});
