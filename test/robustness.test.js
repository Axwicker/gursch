import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE, GurschGame, sanitizeSettings } from '../src/engine/game.js';
import { makeGame, rigRound, hand, seededRng } from './helpers.js';

const play = (g, pid, cards) => g.handleAction(pid, { type: 'play', cardIds: cards.map((c) => c.id) });

test('[A5] inställningar från klienten valideras', () => {
  assert.deepEqual(sanitizeSettings({ slaskCallSeconds: 1e9, maxSlasks: 'x', multiplierValue: -5, hack: 1 }), {});
  assert.deepEqual(sanitizeSettings({ multiplierValue: 25, chatEnabled: false }), { multiplierValue: 25, chatEnabled: false });

  const g = makeGame(['Axel', 'Erik']);
  assert.throws(() => g.updateSettings('axel', { slaskCallSeconds: 99999 }), /Ogiltig/);
  assert.equal(g.settings.slaskCallSeconds, 8);
  const g2 = new GurschGame({ id: 'X', settings: { multiplierValue: 3.7, maxSlasks: 3 } });
  assert.equal(g2.settings.multiplierValue, 10, 'ogiltigt värde i konstruktorn ignoreras');
});

test('[A2] publikt state läcker aldrig dolda kort', () => {
  const g = makeGame(['Axel', 'Erik', 'Leo']);
  g.startGame('axel');
  const pub = JSON.stringify(g.publicState());
  for (const [pid, cards] of g.round.hands) {
    const visible = g.round.visible.get(pid);
    for (const c of cards) {
      if (visible.has(c.id)) continue;
      assert.equal(pub.includes(`"${c.id}"`), false, `dolt kort ${c.id} hos ${pid} syns i publikt state`);
    }
  }
});

test('[R12] [R17] slask: tar draghögen slut blandas hela slänghögen in, även den gamla handen', () => {
  const g = makeGame(['Axel', 'Erik']);
  g.startGame('axel');
  const r = g.round;
  const pid = g.currentTurnPlayerId();
  // Bara 2 kort kvar i draghögen och en tom slänghög: de 3 sista korten MÅSTE komma
  // från den omblandade slänghögen, som då bara innehåller slaskarens gamla hand.
  r.piles.draw = r.piles.draw.slice(0, 2);
  r.piles.discard = [];
  const oldIds = r.hands.get(pid).map((c) => c.id);
  g.handleAction(pid, { type: 'slask' });
  g.resolveSlask();
  const newIds = r.hands.get(pid).map((c) => c.id);
  assert.equal(newIds.length, 5);
  assert.equal(newIds.filter((id) => oldIds.includes(id)).length, 3);
});

test('[A4] ny spelare kan gå med mellan rundor men inte mitt i en runda', () => {
  const g = makeGame(['Axel', 'Erik']);
  const r = rigRound(g, { axel: hand('K'), erik: hand('2') }, 'axel');
  assert.throws(() => g.addPlayer({ id: 'leo', nickname: 'Leo' }), /mellan rundor/);
  play(g, 'axel', r.hands.get('axel').slice());
  play(g, 'erik', r.hands.get('erik').slice());
  assert.equal(g.phase, PHASE.ROUND_RESULT);
  g.addPlayer({ id: 'leo', nickname: 'Leo' });
  g.nextRound('axel');
  assert.equal(g.round.hands.get('leo').length, 5);
});

test('[R4] dealern ligger kvar när en spelare före dealern lämnar', () => {
  const g = makeGame(['Axel', 'Erik', 'Leo']);
  g.dealerIndex = 2; // Leo
  g.removePlayer('axel');
  assert.equal(g.players[g.dealerIndex].id, 'leo');
});

test('[A4] host lämnas över till en ansluten spelare om host är borta', () => {
  const g = makeGame(['Axel', 'Erik']);
  assert.equal(g.ensureConnectedHost(), false, 'ansluten host behålls');
  g.setConnected('axel', false);
  assert.equal(g.hostId, 'axel', 'ingen direkt överlämning - host får chans att återansluta');
  assert.equal(g.ensureConnectedHost(), true);
  assert.equal(g.hostId, 'erik');
});

test('[R25] publikt state visar vem som leder sticket och det senaste sticket', () => {
  const g = makeGame(['Axel', 'Erik', 'Leo']);
  const r = rigRound(g, { axel: hand('K', '2'), erik: hand('A', '3'), leo: hand('Q', '4') }, 'axel');
  play(g, 'axel', [r.hands.get('axel')[0]]);
  play(g, 'erik', [r.hands.get('erik')[0]]);
  assert.equal(g.publicState().trick.leadingPlayerId, 'erik');
  play(g, 'leo', [r.hands.get('leo')[1]]);   // Leos lägsta (4) - Q är inte tillåten på ett ess
  const s = g.publicState();
  assert.equal(s.trick.plays.length, 0);
  assert.equal(s.lastTrick.winnerId, 'erik');
  assert.equal(s.lastTrick.plays.length, 3);
});

test('[R9] den som har turen visas som den som bestämmer antalet efter en STAY', () => {
  const g = new GurschGame({ id: 'T', rng: seededRng(3) });
  for (const n of ['a', 'b', 'c']) g.addPlayer({ id: n, nickname: n });
  g.startGame('a');
  const first = g.currentTurnPlayerId();
  g.handleAction(first, { type: 'stay' });
  const s = g.publicState();
  assert.equal(s.discard.requiredCount, null);
  assert.equal(s.discard.proposerId, g.currentTurnPlayerId());
  assert.notEqual(s.discard.proposerId, first);
});
