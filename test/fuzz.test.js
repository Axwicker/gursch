// fuzz.test.js - slumpade bottar spelar många rundor. Efter varje drag kontrolleras
// invarianterna: varje kort finns i exakt en zon, pengar är nollsumma, ingen legal
// action kastar fel och varje runda tar slut.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GurschGame, PHASE } from '../src/engine/game.js';
import { seededRng, realtimeStep, randomRealtimeAction } from './helpers.js';

/** Alla kort i en kontext (normalrunda eller mini-gursch), oavsett zon. */
function cardsInPlay(ctx) {
  const ids = [
    ...ctx.piles.draw, ...ctx.piles.discard,
    ...[...ctx.hands.values()].flat(),
    ...ctx.tricks.flatMap((t) => t.plays.flatMap((p) => p.cards)),
    ...(ctx.currentTrick?.plays.flatMap((p) => p.cards) ?? []),
  ].map((c) => c.id);
  return ids;
}

function assertInvariants(g) {
  const sum = g.players.reduce((s, p) => s + p.balance, 0);
  assert.equal(sum, 0, 'pengar ska vara nollsumma');
  if (!g.round || g.phase === PHASE.ROUND_RESULT) return;
  if (g.phase === PHASE.TIEBREAK_DRAW) {
    // [R31] Dragningen tar inga kort ur mini-gurschen - platserna är bara en vy av draghögen.
    // (sista sticket ligger både i tricks och currentTrick när mini-gurschen är slut)
    assert.equal(new Set(cardsInPlay(g.round.mini)).size, 52);
    assert.equal(new Set(g.round.tiebreak.slots.map((c) => c.id)).size, g.round.tiebreak.slots.length);
    return;
  }
  const ctx = g.phase === PHASE.MINI_GURSCH ? g.round.mini : g.round;
  const ids = cardsInPlay(ctx);
  assert.equal(ids.length, 52, `52 kort ska finnas, hittade ${ids.length}`);
  assert.equal(new Set(ids).size, 52, 'ett kort får aldrig finnas i två zoner');
  const handSizes = [...ctx.hands.entries()]
    .filter(([id]) => !ctx.participants || ctx.participants.includes(id))
    .map(([, h]) => h.length);
  if (g.phase === PHASE.TRICK || g.phase === PHASE.MINI_GURSCH) {
    const t = ctx.currentTrick;
    // Alla som inte spelat i sticket ännu har lika många kort
    const notPlayed = t.turnOrder.slice(t.turnIndex).map((id) => ctx.hands.get(id).length);
    assert.equal(new Set(notPlayed).size <= 1, true, 'ojämna händer i stickspelet');
  } else {
    for (const n of handSizes) assert.equal(n, 5, 'alla ska ha 5 kort före stickspelet');
  }
}

/** Väljer en slumpad giltig ledkombination: ett kort, eller en valör + valfria 7:or. */
function randomLead(hand, rng) {
  if (rng() < 0.4) return [hand[Math.floor(rng() * hand.length)]];
  const sevens = hand.filter((c) => c.rank === 7);
  const ranks = [...new Set(hand.filter((c) => c.rank !== 7).map((c) => c.rank))];
  if (!ranks.length) return sevens.slice(0, 1 + Math.floor(rng() * sevens.length));
  const r = ranks[Math.floor(rng() * ranks.length)];
  const same = hand.filter((c) => c.rank === r);
  return same.concat(sevens.slice(0, Math.floor(rng() * (sevens.length + 1))));
}

function randomSubset(hand, n, rng) {
  const copy = hand.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

const rtState = {};

function step(g, rng, clock) {
  if (!g.pendingSlask && (g.phase === PHASE.NEGOTIATION || g.phase === PHASE.DISCARD_SELECT)) {
    return realtimeStep(g, clock, rng, (id, pub, priv) => randomRealtimeAction(pub, priv, rng), rtState);
  }
  // Ibland går tiden ut - det automatiska draget måste alltid vara legalt.
  if (!g.pendingSlask && g.turnDeadline && rng() < 0.1) {
    clock.t = g.turnDeadline;
    assert.equal(g.expireTurn(), true, `timeout gjorde inget i fas ${g.phase}`);
    return;
  }
  if (g.pendingSlask) {
    const callers = g.players.filter((p) => p.id !== g.pendingSlask.playerId);
    if (rng() < 0.5) g.handleAction(callers[Math.floor(rng() * callers.length)].id, { type: 'callSlask' });
    else g.resolveSlask();
    return;
  }
  if (g.phase === PHASE.TIEBREAK_DRAW && g.round.tiebreak.settleAt) {
    clock.t = g.round.tiebreak.settleAt;
    assert.equal(g.tick(), true, 'dragningen måste avslutas');
    return;
  }
  const pid = g.currentTurnPlayerId();
  assert.ok(pid, `ingen spelare har turen i fas ${g.phase}`);
  const { hand, actions } = g.privateState(pid);
  const types = actions.map((a) => a.type);
  assert.ok(types.length > 0, `${pid} har turen men inga actions (${g.phase})`);

  const roll = rng();
  if (types.includes('slask') && roll < 0.08) return g.handleAction(pid, { type: 'slask' });
  if (types.includes('pass') && !types.includes('discard')) return g.handleAction(pid, { type: 'pass' });
  if (types.includes('stay') && roll < 0.3) return g.handleAction(pid, { type: 'stay' });
  const discard = actions.find((a) => a.type === 'discard');
  if (discard) {
    const n = discard.free ? 1 + Math.floor(rng() * 4) : discard.count;
    return g.handleAction(pid, { type: 'discard', cardIds: randomSubset(hand, n, rng).map((c) => c.id) });
  }
  const tbPick = actions.find((a) => a.type === 'tiebreakPick');
  if (tbPick) return g.handleAction(pid, { type: 'tiebreakPick', index: tbPick.options[Math.floor(rng() * tbPick.options.length)] });
  const play = actions.find((a) => a.type === 'play');
  if (play) {
    assert.ok(play.options.length > 0, 'det måste alltid finnas minst ett lagligt spel');
    if (play.lead) return g.handleAction(pid, { type: 'play', cardIds: randomLead(hand, rng).map((c) => c.id) });
    return g.handleAction(pid, { type: 'play', cardIds: play.options[Math.floor(rng() * play.options.length)] });
  }
  throw new Error(`Bot hittade ingen action: ${JSON.stringify(actions)}`);
}

for (const [players, cap] of [[2, 0], [3, 0], [4, 0], [5, 0], [3, 1], [4, 1]]) {
  test(`[A3] fuzz: ${players} spelare, mini-gursch-tak ${cap}, 150 rundor med slumpade legala drag`, () => {
    const rng = seededRng(1000 + players);
    const clock = { t: 0 };
    const g = new GurschGame({
      id: 'FUZZ', rng: seededRng(7 * players), now: () => clock.t, settings: { miniGurschCap: cap },
    });
    let tiebreaks = 0;
    for (let i = 0; i < players; i++) g.addPlayer({ id: `p${i}`, nickname: `P${i}` });
    g.startGame('p0');
    let rounds = 0;
    let steps = 0;
    while (rounds < 150) {
      step(g, rng, clock);
      assertInvariants(g);
      steps += 1;
      assert.ok(steps < 150 * 400, 'spelet fastnade');
      if (g.phase === PHASE.ROUND_RESULT) {
        const r = g.result;
        assert.ok(g.players.some((p) => p.id === r.loserId), 'loser måste finnas');
        assert.notEqual(r.loserId, r.quintExitPlayerId, 'quint-spelaren kan inte bli loser');
        if (r.tiebreak) tiebreaks += 1;
        rounds += 1;
        g.nextRound('p0');
      }
    }
    if (cap) assert.ok(tiebreaks > 0, 'fuzzen ska nå dragningen minst en gång');
  });
}
