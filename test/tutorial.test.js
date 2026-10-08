// Övningsrundan (src/engine/tutorial.js, public/tutorial.js): riggad giv, guidens paus och bottar
// som synar spelarens slask en gång.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { GurschGame, PHASE } from '../src/engine/game.js';
import { chooseBotAction } from '../src/engine/bot.js';
import { replayRound } from '../src/engine/replay.js';
import { RoomManager } from '../src/server/rooms.js';
import {
  TUTORIAL_SETTINGS, TUTORIAL_HAND, TUTORIAL_FACE_UP, TUTORIAL_SLASK_CALLS, tutorialDeck, tutorialShouldCall,
} from '../src/engine/tutorial.js';
import { COACH_STEPS } from '../public/tutorial.js';
import { seededRng, realtimeStep } from './helpers.js';

function tutorialGame(clock = { t: 0 }) {
  const g = new GurschGame({ id: 'TUT', settings: TUTORIAL_SETTINGS, rng: seededRng(5), now: () => clock.t, tutorial: true });
  g.addPlayer({ id: 'me', nickname: 'Du' });
  g.hostId = 'me';
  g.addBot('me', 'easy');
  g.addBot('me', 'easy');
  g.startGame('me', { deck: tutorialDeck(g, 'me', seededRng(9)) });
  g.drainEvents();
  return g;
}

test('[A7] [R5] övningsrundans giv: spelaren får 3,3,7,K och en uppvänd dam och vinner floppen', () => {
  const g = tutorialGame();
  const mine = g.privateState('me').hand;
  assert.deepEqual(mine.map((c) => c.id).sort(), [...TUTORIAL_HAND, TUTORIAL_FACE_UP].sort());
  assert.deepEqual(mine.filter((c) => c.faceUp).map((c) => c.id), [TUTORIAL_FACE_UP]);
  assert.equal(g.round.flopWinnerId, 'me');
  assert.equal(g.currentTurnPlayerId(), 'me');
  // Bottarna har inga damer, kungar eller ess
  for (const bot of g.players.filter((p) => p.isBot)) {
    assert.ok(g.round.hands.get(bot.id).every((c) => c.rank < 12 || c.id === TUTORIAL_FACE_UP), bot.id);
  }
  // Alla 52 kort finns kvar, exakt en gång
  const all = [...g.round.piles.draw, ...[...g.round.hands.values()].flat()].map((c) => c.id);
  assert.equal(new Set(all).size, 52);
});

test('riggad giv: fungerar med vilken dealer som helst och avvisar dubbletter', () => {
  const g = new GurschGame({ id: 'T', rng: seededRng(1), tutorial: true });
  g.addPlayer({ id: 'me', nickname: 'Du' });
  g.hostId = 'me';
  g.addBot('me', 'easy');
  g.addBot('me', 'easy');
  g.dealerIndex = 2;
  g.startRound({ deck: tutorialDeck(g, 'me') });
  assert.equal(g.round.flopWinnerId, 'me');
  assert.throws(() => g.startRound({ deck: ['S3', 'S3'] }), /dubbletter/);
});

test('[A7] övningsrundan har ingen turtimer och ×1', () => {
  const g = tutorialGame();
  assert.equal(g.turnDeadline, null);
  assert.equal(g.round.multiplier, 1);
  assert.equal(g.publicState().tutorial, true);
});

test('[A6] guidens paus finns bara i övningsrundan, och knapparna syns medan den pratar', () => {
  const plain = new GurschGame({ id: 'P', rng: seededRng(1) });
  plain.addPlayer({ id: 'a', nickname: 'A' });
  plain.addPlayer({ id: 'b', nickname: 'B' });
  plain.hostId = 'a';
  plain.startGame('a');
  assert.throws(() => plain.pause('a', { reason: 'tutorial' }), /Ogiltig paus/);
  plain.pause('a');
  assert.deepEqual(plain.privateState(plain.currentTurnPlayerId()).actions, []);

  const g = tutorialGame();
  g.pause('me', { reason: 'tutorial' });
  assert.equal(g.publicState().paused.reason, 'tutorial');
  assert.ok(g.privateState('me').actions.some((a) => a.type === 'stay'), 'knapparna syns');
  assert.throws(() => g.handleAction('me', { type: 'stay' }), /guiden/);
  g.resume('me');
  g.handleAction('me', { type: 'stay' });
});

test('[A6] en övningsrunda med guidens pauser spelas klart och kan spelas upp igen', () => {
  const clock = { t: 1000 };
  const rng = seededRng(3);
  const g = tutorialGame(clock);
  const rt = {};
  let steps = 0;
  while (g.phase !== PHASE.ROUND_RESULT) {
    assert.ok(++steps < 2000, 'övningsrundan fastnade');
    clock.t += 500;
    // Guiden pausar ibland en stund och fortsätter sedan
    if (rng() < 0.15) { g.pause('me', { reason: 'tutorial' }); clock.t += 4000; g.resume('me'); }
    const pub = g.publicState();
    if (g.pendingSlask && !g.pendingSlask.resolved) {
      clock.t = g.pendingSlask.deadline;
      g.tick();
      continue;
    }
    if (g.phase === PHASE.NEGOTIATION || g.phase === PHASE.DISCARD_SELECT) {
      realtimeStep(g, clock, rng, (id, pubNow, priv) => chooseBotAction({ pub: pubNow, priv, botId: id, rng, level: 'easy' }), rt);
      continue;
    }
    const pid = g.currentTurnPlayerId();
    g.handleAction(pid, chooseBotAction({ pub, priv: g.privateState(pid), botId: pid, rng, level: 'easy' }));
  }
  const log = g.roundLog(1);
  assert.equal(log.tutorial, true);
  assert.equal(log.deck.length, 15);
  const { game } = replayRound(log);
  assert.deepEqual(game.result, g.result);
});

test('bottarna synar aldrig varandra i övningsrundan, och spelaren bara så länge synningar finns kvar', () => {
  assert.equal(tutorialShouldCall({ slaskerIsBot: true, callsLeft: 1 }), false);
  assert.equal(tutorialShouldCall({ slaskerIsBot: false, callsLeft: 1 }), true);
  assert.equal(tutorialShouldCall({ slaskerIsBot: false, callsLeft: 0 }), false);
});

test('[A7] [R19] servern: en bott synar spelarens första slask i övningsrundan, men inte den andra', (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  t.after(() => mock.timers.reset());
  const manager = new RoomManager({
    onBroadcast: (r) => { r.game.drainEvents(); manager.syncGameTimer(r); manager.syncBots(r); },
    onError: (_r, err) => { throw err; },
  });
  const room = manager.createRoom(TUTORIAL_SETTINGS, { tutorial: { slaskCallsLeft: TUTORIAL_SLASK_CALLS } });
  const g = room.game;
  g.addPlayer({ id: 'me', nickname: 'Du' });
  g.hostId = 'me';
  g.addBot('me', 'easy');
  g.addBot('me', 'easy');
  g.startGame('me', { deck: tutorialDeck(g, 'me') });
  const sync = () => { manager.syncGameTimer(room); manager.syncBots(room); };

  g.handleAction('me', { type: 'slask' });
  sync();
  mock.timers.tick(TUTORIAL_SETTINGS.slaskCallSeconds * 1000 + 100);
  const first = g.round.slaskLog.at(-1);
  assert.ok(first.callerId, 'första slasken synades');
  assert.equal(g.player('me').balance, -20, 'kung och dam: 2 face cards × 10 kr');
  assert.equal(room.tutorial.slaskCallsLeft, 0);

  g.handleAction('me', { type: 'slask' });   // R17: spelaren väljer igen på sin nya hand
  sync();
  mock.timers.tick(TUTORIAL_SETTINGS.slaskCallSeconds * 1000 + 100);
  assert.equal(g.pendingSlask, null, 'slaskfönstret stängdes');
  assert.equal(g.player('me').slasks, 2);
  assert.equal(g.round.slaskLog.length, 1, 'andra slasken synades inte');
  assert.equal(g.player('me').balance, -20);
  manager.clearTimers(room);
});

test('guidens steg har unika id:n och text', () => {
  const ids = COACH_STEPS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const s of COACH_STEPS) assert.equal(typeof s.when, 'function', s.id);
});
