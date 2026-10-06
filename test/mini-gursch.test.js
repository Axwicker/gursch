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

test('[R30] mini-gursch avgör losern och betalningen använder slutvärdet i mini-gurschen', () => {
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
  assert.equal(g.result.loserValue, 14, 'A i mini-gurschen');
  const byId = Object.fromEntries(g.result.players.map((p) => [p.id, p]));
  assert.equal(byId[b].change, -14 * 20 * 2);
  assert.equal(byId.leo.change, 280);
  assert.equal(byId[b].finalValue, 14, 'resultatet visar vad man gick ut på i mini-gurschen');
  assert.deepEqual(byId[b].finalCards.map((c) => c.rank), [14]);
  assert.equal(byId.leo.finalValue, 6, 'den som inte var med i mini-gurschen visar rundans värde');
});

test('[R30] beloppet följer mini-gurschens slutvärde, inte rundans lika värde', () => {
  const g = setupTie();   // rundan slutade lika på 14
  const mini = g.round.mini;
  const [a, b] = [mini.starterId, mini.participants.find((id) => id !== mini.starterId)];
  mini.hands.set(a, hand('4'));
  mini.hands.set(b, hand('5'));
  mini.visible.set(a, new Set());
  mini.visible.set(b, new Set());
  g.startTrick(mini, a);
  play(g, a, mini.hands.get(a).slice());
  play(g, b, mini.hands.get(b).slice());
  assert.equal(g.result.loserId, b);
  assert.equal(g.result.loserValue, 5);
  const byId = Object.fromEntries(g.result.players.map((p) => [p.id, p]));
  assert.equal(byId[b].change, -5 * 20 * 2);
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

/** Mini-gurschen slutar lika (K mot K) med cap 1, så dragningen börjar. */
function setupTiebreak() {
  const g = setupTie({ miniGurschCap: 1 });
  const clock = { t: 1_000_000 };
  g.now = () => clock.t;
  const mini = g.round.mini;
  const [a, b] = mini.participants;
  mini.hands.set(a, hand('K'));
  mini.hands.set(b, hand('K'));
  mini.visible.set(a, new Set());
  mini.visible.set(b, new Set());
  g.startTrick(mini, a);
  play(g, a, mini.hands.get(a).slice());
  play(g, b, mini.hands.get(b).slice());
  return { g, clock, a, b };
}

/** Lägger de givna valörerna överst bland de dolda platserna (plats 0, 1, …). */
function rigSlots(g, ranks) {
  const tb = g.round.tiebreak;
  hand(...ranks).forEach((c, i) => { tb.slots[i] = c; });
}

const pick = (g, pid, index) => g.handleAction(pid, { type: 'tiebreakPick', index });

test('[R31] när taket nås börjar en dragning bland de lika', () => {
  const { g } = setupTiebreak();
  assert.equal(g.phase, PHASE.TIEBREAK_DRAW);
  const tb = g.round.tiebreak;
  assert.deepEqual(tb.participants, g.round.dealOrder.filter((id) => tb.participants.includes(id)),
    'sittordning efter dealern');
  assert.equal(g.currentTurnPlayerId(), tb.participants[0]);
  assert.equal(tb.slots.length, 52 - 3 * 2, 'korten som finns kvar i mini-gurschens draghög');
});

test('[R31] högst kort vinner, lägst betalar sitt slutvärde × senaste multiplier', () => {
  const { g, clock } = setupTiebreak();
  const [first, second] = g.round.tiebreak.participants;
  rigSlots(g, ['9', '4']);
  pick(g, first, 0);
  pick(g, second, 1);
  assert.equal(g.phase, PHASE.TIEBREAK_DRAW, 'det sista kortet hinner synas');
  assert.equal(g.currentTurnPlayerId(), null);
  clock.t = g.nextWakeup();
  assert.ok(g.tick());
  assert.equal(g.phase, PHASE.ROUND_RESULT);
  assert.equal(g.result.loserId, second, '4 är lägre än 9');
  assert.equal(g.result.capReached, true);
  assert.equal(g.result.multiplier, 20, 'senaste nivåns multiplier');
  assert.equal(g.result.loserValue, 13, 'slutvärdet i den senaste mini-gurschen (K)');
  assert.equal(g.result.tiebreak.length, 1);
});

test('[R31] 7:an räknas som 7 i dragningen', () => {
  const { g, clock } = setupTiebreak();
  const [first, second] = g.round.tiebreak.participants;
  rigSlots(g, ['7', '8']);
  pick(g, first, 0);
  pick(g, second, 1);
  clock.t = g.nextWakeup();
  g.tick();
  assert.equal(g.result.loserId, first);
});

test('[R31] lika lågt ger en ny dragomgång bland de lika', () => {
  const { g, clock } = setupTiebreak();
  const [first, second] = g.round.tiebreak.participants;
  rigSlots(g, ['J', 'J', 'A', '2']);
  pick(g, first, 0);
  pick(g, second, 1);
  assert.equal(g.round.tiebreak.drawNumber, 2);
  assert.equal(g.currentTurnPlayerId(), first);
  assert.throws(() => pick(g, first, 0), /dolda/, 'ett redan valt kort kan inte väljas igen');
  pick(g, first, 2);
  pick(g, second, 3);
  clock.t = g.nextWakeup();
  g.tick();
  assert.equal(g.result.loserId, second);
  assert.equal(g.result.tiebreak.length, 2);
});

test('[R31] [A2] de dolda korten syns inte i det publika läget', () => {
  const { g } = setupTiebreak();
  const [first] = g.round.tiebreak.participants;
  pick(g, first, 5);
  const pub = g.publicState();
  assert.equal(pub.tiebreak.slotCount, 46);
  assert.equal(pub.tiebreak.taken.length, 1);
  assert.equal(pub.tiebreak.taken[0].slot, 5);
  const hiddenIds = g.round.tiebreak.slots.filter((_, i) => i !== 5).map((c) => c.id);
  const json = JSON.stringify(pub);
  for (const id of hiddenIds) assert.ok(!json.includes(`"${id}"`), `dolt kort ${id} läcker`);
});

test('[R31] [A3] fel spelare och ogiltigt index avvisas', () => {
  const { g } = setupTiebreak();
  const [first, second] = g.round.tiebreak.participants;
  assert.throws(() => pick(g, second, 0), /tur/);
  assert.throws(() => pick(g, first, 999), /dolda/);
  assert.throws(() => pick(g, 'leo', 0), /tur/);
});

test('[R31] [A1] turtimern väljer ett kort åt den som inte hinner', () => {
  const g = setupTie({ miniGurschCap: 1, turnSeconds: 30 });
  const clock = { t: 1_000_000 };
  g.now = () => clock.t;
  const mini = g.round.mini;
  const [a, b] = mini.participants;
  mini.hands.set(a, hand('K'));
  mini.hands.set(b, hand('K'));
  g.startTrick(mini, a);
  play(g, a, mini.hands.get(a).slice());
  play(g, b, mini.hands.get(b).slice());
  const first = g.currentTurnPlayerId();
  clock.t = g.nextWakeup();
  assert.ok(g.tick());
  assert.equal(g.round.tiebreak.draws[0][0].playerId, first);
});

test('[R31] [A6] pausen fryser väntan på resultatet', () => {
  const { g, clock } = setupTiebreak();
  const [first, second] = g.round.tiebreak.participants;
  rigSlots(g, ['9', '4']);
  pick(g, first, 0);
  pick(g, second, 1);
  const settleAt = g.round.tiebreak.settleAt;
  const pausedAt = clock.t;
  g.pause('axel');
  clock.t = settleAt + 10_000;
  assert.equal(g.tick(), false);
  assert.equal(g.phase, PHASE.TIEBREAK_DRAW);
  g.resume('axel');
  assert.equal(g.round.tiebreak.settleAt, settleAt + (clock.t - pausedAt), 'flyttas fram med pausens längd');
  clock.t = g.nextWakeup();
  g.tick();
  assert.equal(g.phase, PHASE.ROUND_RESULT);
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
