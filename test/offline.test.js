// offline.test.js - frånkopplade spelare får aldrig stoppa spelet (A4, A8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GurschGame, PHASE, OFFLINE_TURN_MS } from '../src/engine/game.js';
import { replayRound } from '../src/engine/replay.js';
import { RoomManager, HOST_GRACE_MS, LOBBY_OFFLINE_MS } from '../src/server/rooms.js';
import { seededRng } from './helpers.js';

function timedGame(names, settings = {}) {
  const clock = { t: 1_000_000 };
  const g = new GurschGame({ id: 'T', rng: seededRng(5), now: () => clock.t, settings: { turnSeconds: 30, negotiationSeconds: 20, ...settings } });
  for (const n of names) g.addPlayer({ id: n.toLowerCase(), nickname: n });
  return { g, clock };
}

/** Riggar en pågående förhandling med alla spelare. */
function negotiating(g) {
  g.startGame('axel');
  g.startNegotiation();
  assert.equal(g.phase, PHASE.NEGOTIATION);
  return g.round.negotiation;
}

test('[A8] förhandlingen avgörs av de anslutna', () => {
  const { g } = timedGame(['Axel', 'Erik', 'Leo']);
  const n = negotiating(g);
  g.setConnected('leo', false);
  g.handleAction('axel', { type: 'propose', count: 2 });
  g.handleAction('erik', { type: 'propose', count: 2 });
  assert.equal(n.agreedCount, 2);
});

test('[A8] att tappa anslutningen kan ge enighet, och att komma tillbaka bryter den', () => {
  const { g } = timedGame(['Axel', 'Erik', 'Leo']);
  const n = negotiating(g);
  g.handleAction('axel', { type: 'propose', count: 3 });
  g.handleAction('erik', { type: 'propose', count: 3 });
  assert.equal(n.agreedCount, null, 'Leo har inte föreslagit något');
  g.setConnected('leo', false);
  assert.equal(n.agreedCount, 3);
  g.setConnected('leo', true);
  assert.equal(n.agreedCount, null);
  assert.equal(n.confirmAt, null);
});

test('[A8] turtimern av: en frånkopplad spelare låser inte rundan', () => {
  const { g, clock } = timedGame(['Axel', 'Erik'], { turnSeconds: 0 });
  g.startGame('axel');
  const turn = g.currentTurnPlayerId();
  assert.equal(g.nextWakeup() === null || g.turnDeadline === null, true);
  g.setConnected(turn, false);
  assert.equal(g.turnDeadline, clock.t + OFFLINE_TURN_MS);
  clock.t += OFFLINE_TURN_MS;
  assert.equal(g.tick(), true);
  assert.notEqual(g.currentTurnPlayerId(), turn, 'det passiva draget gjordes');
});

test('[A8] en frånkopplad spelare får kortare tid, och full tid när hen kommer tillbaka', () => {
  const { g, clock } = timedGame(['Axel', 'Erik']);
  g.startGame('axel');
  const turn = g.currentTurnPlayerId();
  g.setConnected(turn, false);
  assert.equal(g.turnDeadline, clock.t + OFFLINE_TURN_MS);
  clock.t += 5_000;
  g.setConnected(turn, true);
  assert.equal(g.turnDeadline, clock.t + 30_000);
});

test('[A8] kortvalet väntar inte på en frånkopplad spelare, inte ens med timern av', () => {
  const { g, clock } = timedGame(['Axel', 'Erik', 'Leo'], { turnSeconds: 0 });
  g.startGame('axel');
  g.startDiscardSelect(2, ['axel', 'erik', 'leo']);
  const ds = g.round.discardSelect;
  assert.equal(ds.deadline, null);
  g.setConnected('leo', false);
  assert.equal(g.nextWakeup(), clock.t + OFFLINE_TURN_MS);
  g.handleAction('axel', { type: 'discard', cardIds: g.round.hands.get('axel').slice(0, 2).map((c) => c.id) });
  clock.t += OFFLINE_TURN_MS;
  assert.equal(g.tick(), true);
  assert.ok(ds.selections.has('leo'), 'korten valdes åt den frånkopplade');
  assert.equal(ds.selections.has('erik'), false, 'den anslutna får välja själv');
  assert.equal(g.phase, PHASE.DISCARD_SELECT, 'väntar fortfarande på Erik');
});

test('[A8] anslutningsbyten loggas och uppspelningen ger samma resultat', () => {
  // Med timern av händer draget bara om uppspelningen vet att spelaren var borta.
  const { g, clock } = timedGame(['Axel', 'Erik', 'Leo'], { turnSeconds: 0 });
  g.startGame('axel');
  const turn = g.currentTurnPlayerId();
  g.setConnected(turn, false);
  clock.t += OFFLINE_TURN_MS;
  assert.equal(g.tick(), true);
  const log = g.reportLog();
  assert.ok(log.events.some((e) => e.connected === false && e.playerId === turn));
  const { game } = replayRound(log);
  assert.equal(game.currentTurnPlayerId(), g.currentTurnPlayerId());
  assert.equal(game.phase, g.phase);
});

test('[A4] hosten byts när någon kommer tillbaka efter att alla varit borta', () => {
  const { g, clock } = timedGame(['Axel', 'Erik']);
  g.setConnected('axel', false);
  g.setConnected('erik', false);
  clock.t += HOST_GRACE_MS + 1;
  g.setConnected('erik', true);
  assert.equal(g.ensureConnectedHost(HOST_GRACE_MS), true);
  assert.equal(g.hostId, 'erik');
});

test('[A4] en host som bara laddar om sidan behåller rollen', () => {
  const { g, clock } = timedGame(['Axel', 'Erik']);
  g.setConnected('axel', false);
  clock.t += 1_000;
  assert.equal(g.ensureConnectedHost(HOST_GRACE_MS), false);
  assert.equal(g.hostId, 'axel');
});

test('[A4] hosten kan ta bort en spelare i lobbyn, men ingen annan och inte mitt i en runda', () => {
  const { g } = timedGame(['Axel', 'Erik', 'Leo']);
  assert.throws(() => g.kickPlayer('erik', 'leo'));
  assert.throws(() => g.kickPlayer('axel', 'axel'));
  g.kickPlayer('axel', 'leo');
  assert.deepEqual(g.players.map((p) => p.id), ['axel', 'erik']);
  g.startGame('axel');
  assert.throws(() => g.kickPlayer('axel', 'erik'));
});

test('[A4] städningen tar bort spökplatser i lobbyn och lämnar saldon och pågående rundor', () => {
  const clock = { t: 1_000_000 };
  const manager = new RoomManager({ onBroadcast: () => {} });
  const room = manager.createRoom({});
  room.game.now = () => clock.t;
  for (const n of ['axel', 'erik', 'leo']) { room.game.addPlayer({ id: n, nickname: n }); room.tokens.set(n, `t-${n}`); }
  room.game.hostId = 'axel';
  room.game.setConnected('erik', false);
  room.game.setConnected('leo', false);
  room.game.players.find((p) => p.id === 'leo').balance = 30;
  clock.t += LOBBY_OFFLINE_MS - 1;
  manager.sweep();
  assert.equal(room.game.players.length, 3, 'för tidigt');
  clock.t += 2;
  manager.sweep();
  assert.deepEqual(room.game.players.map((p) => p.id), ['axel', 'leo'], 'Leo har pengar i spelet och behåller platsen');
  assert.equal(room.tokens.has('erik'), false);
});
