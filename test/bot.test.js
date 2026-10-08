import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GurschGame, PHASE } from '../src/engine/game.js';
import { chooseBotAction, shouldCallSlask, handJudgement, chooseNegotiation } from '../src/engine/bot.js';
import { subsets, isValidLead } from '../src/engine/combination.js';
import { seededRng, makeGame, rigRound, hand, realtimeStep, randomRealtimeAction } from './helpers.js';

/** Slumpspelare: ett legalt men planlöst drag. */
function randomAction(priv, rng) {
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const shuffled = (arr) => arr.map((x) => [rng(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const types = priv.actions.map((a) => a.type);
  const discard = priv.actions.find((a) => a.type === 'discard');
  if (discard && rng() < 0.6) {
    const n = discard.free ? 1 + Math.floor(rng() * 4) : discard.count;
    return { type: 'discard', cardIds: shuffled(priv.hand).slice(0, n).map((c) => c.id) };
  }
  if (types.includes('stay')) return { type: 'stay' };
  if (types.includes('pass')) return { type: 'pass' };
  const play = priv.actions.find((a) => a.type === 'play');
  return { type: 'play', cardIds: pick(play.options) };
}

/** Kör rundor tills `rounds` är klara. strategies: id -> 'bot' | 'random' | 'easy' | 'medium' | 'hard'. */
function simulate(strategies, rounds, seed, { losses } = {}) {
  const rng = seededRng(seed);
  const clock = { t: 0 };
  const rt = {};
  const g = new GurschGame({ id: 'SIM', rng: seededRng(seed + 1), now: () => clock.t, settings: { multiplierValue: 1 } });
  g.addPlayer({ id: 'host', nickname: 'Host' });
  for (const id of Object.keys(strategies)) if (id !== 'host') g.addPlayer({ id, nickname: id, isBot: strategies[id] !== 'random' });
  const levelOf = (id) => (strategies[id] === 'bot' ? 'medium' : strategies[id]);
  g.startGame('host');
  let done = 0;
  let steps = 0;
  while (done < rounds) {
    assert.ok(++steps < rounds * 500, 'spelet fastnade');
    const pub = g.publicState();
    if (g.pendingSlask) {
      const caller = Object.keys(strategies).find((id) =>
        (strategies[id] !== 'random' ? shouldCallSlask({ pub, botId: id, rng, level: levelOf(id) }) : rng() < 0.3)
        && id !== g.pendingSlask.playerId);
      if (caller) g.handleAction(caller, { type: 'callSlask' }); else g.resolveSlask();
      continue;
    }
    if (g.phase === PHASE.ROUND_RESULT) {
      if (losses) losses[g.result.loserId] = (losses[g.result.loserId] || 0) + 1;
      done += 1; g.nextRound('host'); continue;
    }
    if (g.phase === PHASE.NEGOTIATION || g.phase === PHASE.DISCARD_SELECT) {
      realtimeStep(g, clock, rng, (id, pubNow, priv) => (strategies[id] !== 'random'
        ? chooseBotAction({ pub: pubNow, priv, botId: id, rng, level: levelOf(id) })
        : randomRealtimeAction(pubNow, priv, rng)), rt);
      continue;
    }
    const pid = g.currentTurnPlayerId();
    const priv = g.privateState(pid);
    const action = strategies[pid] !== 'random'
      ? chooseBotAction({ pub, priv, botId: pid, rng, level: levelOf(pid) })
      : randomAction(priv, rng);
    g.handleAction(pid, action);   // ett ogiltigt botdrag kastar och fäller testet
  }
  return Object.fromEntries(g.players.map((p) => [p.id, p.balance]));
}

test('[A3] bottar gör bara legala drag (4 bottar, 300 rundor)', () => {
  const balances = simulate({ host: 'bot', b1: 'bot', b2: 'bot', b3: 'bot' }, 300, 11);
  assert.equal(Object.values(balances).reduce((a, b) => a + b, 0), 0);
});

test('en bot slår slumpspelare över tid', () => {
  const balances = simulate({ host: 'random', b1: 'bot', r2: 'random', r3: 'random' }, 400, 21);
  const others = ['host', 'r2', 'r3'].map((id) => balances[id]);
  assert.ok(balances.b1 > Math.max(...others), `bot ${balances.b1} vs slump ${others}`);
});

test('bot leder med quint direkt när den har fem lika', () => {
  const g = makeGame(['Axel', 'Erik']);
  const pub = { players: [{ id: 'axel', slasks: 0, maxSlasks: 3 }], trick: { plays: [] }, discard: null };
  const h = ['S2', 'H2', 'D2', 'C2', 'S7'].map((id) => ({ id, rank: Number(id.slice(1)), suit: id[0] }));
  const options = subsets(h).filter(isValidLead).map((cards) => cards.map((c) => c.id));
  const action = chooseBotAction({ pub, priv: { hand: h, actions: [{ type: 'play', lead: true, count: null, options }] }, botId: 'axel', rng: () => 0.5 });
  assert.equal(action.cardIds.length, 5);
  assert.ok(g);
});

test('[A4] bot kan läggas till och tas bort av host, men blir aldrig host', () => {
  const g = makeGame(['Axel']);
  const bot = g.addBot('axel');
  assert.equal(bot.isBot, true);
  assert.equal(g.publicState().players.find((p) => p.id === bot.id).isBot, true);
  assert.throws(() => g.addBot(bot.id), /host/);
  g.setConnected('axel', false);
  assert.equal(g.ensureConnectedHost(), false, 'boten tar inte över');
  g.removeBot('axel', bot.id);
  assert.equal(g.players.length, 1);
  assert.throws(() => g.removeBot('axel', 'axel'), /ingen bot/);
});

test('[A3] lätt och svår bot gör bara legala drag', () => {
  const balances = simulate({ host: 'hard', e1: 'easy', h2: 'hard', m3: 'medium' }, 25, 31);
  assert.equal(Object.values(balances).reduce((a, b) => a + b, 0), 0);
});

test('lätt bot förlorar klart oftare än medel', () => {
  const losses = {};
  simulate({ host: 'medium', e: 'easy', m2: 'medium', m3: 'medium' }, 300, 41, { losses });
  assert.ok((losses.e || 0) > 1.4 * Math.max(losses.host || 0, losses.m2 || 0, losses.m3 || 0), JSON.stringify(losses));
});

test('svårighetsnivå kan väljas och ändras av host', () => {
  const g = makeGame(['Axel']);
  const bot = g.addBot('axel', 'hard');
  assert.equal(g.publicState().players.find((p) => p.id === bot.id).botLevel, 'hard');
  g.setBotLevel('axel', bot.id, 'easy');
  assert.equal(bot.botLevel, 'easy');
  assert.throws(() => g.setBotLevel('axel', bot.id, 'omöjlig'), /nivå/);
  assert.throws(() => g.addBot('axel', 'extrem'), /nivå/);
  assert.throws(() => g.setBotLevel(bot.id, bot.id, 'hard'), /host/);
  assert.equal(g.addBot('axel').botLevel, 'medium', 'medel är standard');
});

test('[A2] [A3] svår bot gör ett legalt drag utan tillgång till motståndarens dolda kort', () => {
  const g = makeGame(['Axel', 'Erik']);
  const r = rigRound(g, { axel: hand('3', '9', 'K'), erik: hand('2', '2', 'Q') }, 'erik');
  g.handleAction('erik', { type: 'play', cardIds: [r.hands.get('erik')[2].id] });   // Erik leder Q
  const pub = g.publicState();
  // Publikt state innehåller inga av Eriks dolda kort - boten kan bara gissa.
  const erikHidden = r.hands.get('erik').map((c) => c.id);
  assert.equal(erikHidden.some((id) => JSON.stringify(pub).includes(`"${id}"`)), false);
  const action = chooseBotAction({ pub, priv: g.privateState('axel'), botId: 'axel', rng: seededRng(2), level: 'hard' });
  assert.equal(action.cardIds.length, 1);
  g.handleAction('axel', action);   // legalt
});

test('botens bedömning: ess, 7:or och 4 eller lägre är bra; STAY bara med väldigt bra hand', () => {
  const { isGreatHand, wantedDiscards, discardOrder } = handJudgement;
  const ranks = (cards) => cards.map((c) => c.rank);
  assert.equal(wantedDiscards(hand('A', '7', '3', '2', 'K'), false), 1, 'K är dåligt');
  assert.equal(isGreatHand(hand('A', '7', '3', '2', '4'), false), true);
  assert.equal(isGreatHand(hand('A', 'A', '7', '7', '3'), false), false, 'bara ett lågt kort att gå ut på');
  assert.equal(wantedDiscards(hand('A', 'A', '7', '7', '3'), false), 1);
  assert.deepEqual(ranks(discardOrder(hand('A', 'A', '7', '7', '3'), false)).slice(0, 1), [14], 'slänger ett ess, inte 7:or eller lågt kort');
  assert.equal(wantedDiscards(hand('5', '6', '8', '9', '10'), false), 4, 'medelmåttiga kort ska bort - högst 4');
});

test('för den som leder första sticket är par bra kort', () => {
  const { isGreatHand, wantedDiscards } = handJudgement;
  assert.equal(isGreatHand(hand('K', 'K', '3', '2', 'A'), true), true, 'flopvinnare: K,K är bra');
  assert.equal(wantedDiscards(hand('K', 'K', '3', '2', 'A'), false), 2, 'andra: K,K ska bort');
});

// ---- slängförhandlingen: boten har en egen åsikt (rapport 2026-10-07, en testare) ----

const negPub = (proposals, number = 1) => ({
  flopWinnerId: 'h',
  negotiation: { number, participants: Object.keys(proposals), proposals },
});

test('[R13] boten föreslår först vad den själv vill, även om spelaren redan föreslagit', () => {
  const bad = hand('9', '10', 'J', 'Q', 'K');   // vill slänga 4
  const action = chooseNegotiation(negPub({ bot: null, h: 1 }), bad, 'bot', () => 0.99, 'medium');
  assert.deepEqual(action, { type: 'propose', count: 4 });
});

test('[R13] boten följer inte ett förslag långt från vad den vill, men möts på ±1', () => {
  const bad = hand('9', '10', 'J', 'Q', 'K');   // vill slänga 4
  assert.equal(chooseNegotiation(negPub({ bot: 4, h: 1 }), bad, 'bot', () => 0.99, 'medium'), null, 'står kvar på 4');
  assert.deepEqual(chooseNegotiation(negPub({ bot: 4, h: 3 }), bad, 'bot', () => 0.99, 'medium'), { type: 'propose', count: 3 });
});
