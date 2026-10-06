import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE } from '../src/engine/game.js';
import { makeGame, rigRound, hand } from './helpers.js';

const play = (g, pid, cards) => g.handleAction(pid, { type: 'play', cardIds: cards.map((c) => c.id) });

test('[R21] [R23] [R25] [R26] [R28] exempelrundan i specifikationen (avsnitt 62)', () => {
  const g = makeGame(['Axel', 'Erik', 'Leo', 'Oskar'], { multiplierMode: 'fixed', multiplierValue: 10 });
  const hands = {
    axel: hand('A', 'A', '7', '3', '3'),
    erik: hand('2', '2', '7', 'Q', 'K'),
    leo: hand('A', '3', '3', 'Q', '4'),
    oskar: hand('2', '3', 'A', '7', 'K'),
  };
  const r = rigRound(g, hands, 'axel');
  r.multiplier = 10;

  const h = (pid) => r.hands.get(pid);
  // Stick 1: Axel A,A | Erik 2,7 | Leo A,3 | Oskar A,7
  play(g, 'axel', [h('axel')[0], h('axel')[1]]);
  play(g, 'erik', [h('erik')[0], h('erik')[2]]);
  play(g, 'leo', [h('leo')[0], h('leo')[1]]);
  play(g, 'oskar', [h('oskar')[2], h('oskar')[3]]);

  assert.equal(r.tricks[0].winnerId, 'axel', 'clean A,A slår semi-mixed A,7');
  assert.equal(g.currentTurnPlayerId(), 'axel');

  // Stick 2: alla spelar ut sina sista tre kort
  play(g, 'axel', h('axel').slice());
  play(g, 'erik', h('erik').slice());
  play(g, 'leo', h('leo').slice());
  play(g, 'oskar', h('oskar').slice());

  assert.equal(g.phase, PHASE.ROUND_RESULT);
  const byId = Object.fromEntries(g.result.players.map((p) => [p.id, p]));
  assert.equal(byId.axel.finalValue, 9, '7,3,3 = 3+3+3');
  assert.equal(byId.erik.finalValue, 27);
  assert.equal(byId.leo.finalValue, 19);
  assert.equal(byId.oskar.finalValue, 18);
  assert.equal(g.result.loserId, 'erik');
  assert.equal(g.result.multiplier, 10);
  assert.deepEqual(
    [byId.axel.change, byId.erik.change, byId.leo.change, byId.oskar.change],
    [270, -810, 270, 270],
  );
  assert.deepEqual(
    g.players.map((p) => p.balance),
    [270, -810, 270, 270],
  );

  // dealern flyttas ett steg efter rundan
  const dealerBefore = g.dealerIndex;
  g.nextRound(g.hostId);
  assert.equal(g.dealerIndex, (dealerBefore + 1) % 4);
  assert.equal(g.roundNumber, 2);
});

test('[R25] sist lagda vinner vid exakt lika kombination', () => {
  const g = makeGame(['Axel', 'Erik']);
  const r = rigRound(g, { axel: hand('K', 'K'), erik: hand('K', 'K') }, 'axel');
  play(g, 'axel', r.hands.get('axel').slice());
  play(g, 'erik', r.hands.get('erik').slice());
  assert.equal(r.tricks[0].winnerId, 'erik');
});

test('[R7] [R25] ensam 7 och ensam A är lika starka - sist lagd vinner', () => {
  const g = makeGame(['Axel', 'Erik']);
  const r = rigRound(g, { axel: hand('A', '2'), erik: hand('7', '2') }, 'axel');
  play(g, 'axel', [r.hands.get('axel')[0]]);
  play(g, 'erik', [r.hands.get('erik')[0]]);
  assert.equal(r.tricks[0].winnerId, 'erik', '7:an lades sist');

  const g2 = makeGame(['Axel', 'Erik']);
  const r2 = rigRound(g2, { axel: hand('7', '2'), erik: hand('A', '2') }, 'axel');
  play(g2, 'axel', [r2.hands.get('axel')[0]]);
  play(g2, 'erik', [r2.hands.get('erik')[0]]);
  assert.equal(r2.tricks[0].winnerId, 'erik', 'esset lades sist');
});

test('[R23] sticket definieras av utspelet - alla måste spela lika många kort', () => {
  const g = makeGame(['Axel', 'Erik', 'Leo']);
  const r = rigRound(g, {
    axel: hand('K', 'K', '2'), erik: hand('A', '7', '3'), leo: hand('Q', 'Q', '4'),
  }, 'axel');
  play(g, 'axel', r.hands.get('axel').slice(0, 2));
  assert.throws(() => play(g, 'erik', [r.hands.get('erik')[0]]), /exakt 2 kort/);
  play(g, 'erik', r.hands.get('erik').slice(0, 2));   // A,7 semi-mixed
  // Q,Q är varken 7:or, minst A (som leder) eller Leos lägsta kort (4,Q) - ogiltigt
  assert.throws(() => play(g, 'leo', r.hands.get('leo').slice(0, 2)), /lägsta/);
  play(g, 'leo', [r.hands.get('leo')[0], r.hands.get('leo')[2]]);   // Q,4 = hans två lägsta
  assert.equal(r.tricks[0].winnerId, 'axel', 'clean K,K slår semi-mixed A,7');
});

test('[R22] mixed utspel är inte ett giltigt ledutspel', () => {
  const g = makeGame(['Axel', 'Erik']);
  const r = rigRound(g, { axel: hand('Q', 'K', '10'), erik: hand('2', '2', '2') }, 'axel');
  assert.throws(() => play(g, 'axel', r.hands.get('axel').slice(0, 2)), /giltig kombination/);
  play(g, 'axel', [r.hands.get('axel')[0]]);  // ensamt kort går alltid
});

test('[R24] spelare måste inte slå - 7:a plus lägsta kort går', () => {
  const g = makeGame(['Axel', 'Erik']);
  const r = rigRound(g, { axel: hand('A', 'A', '5'), erik: hand('2', '2', '7') }, 'axel');
  play(g, 'axel', r.hands.get('axel').slice(0, 2));
  play(g, 'erik', [r.hands.get('erik')[0], r.hands.get('erik')[2]]); // 2,7 trots att inget slår
  assert.equal(r.tricks[0].winnerId, 'axel');
});

test('[R25] ledningen avgörs i spelordning: 8,8 → A,7 → 2,2 vinns av 8,8', () => {
  const g = makeGame(['Axel', 'Erik', 'Leo']);
  const r = rigRound(g, {
    axel: hand('8', '8', '4'), erik: hand('A', '7', '3'), leo: hand('2', '2', 'K'),
  }, 'axel');
  play(g, 'axel', r.hands.get('axel').slice(0, 2));
  play(g, 'erik', r.hands.get('erik').slice(0, 2));   // semi-mixed tar inte över clean
  play(g, 'leo', r.hands.get('leo').slice(0, 2));     // lägre clean tar inte över
  assert.equal(r.tricks[0].winnerId, 'axel');
});
