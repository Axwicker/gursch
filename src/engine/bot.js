// bot.js - AI-motspelare. Boten ser EXAKT samma information som en människa:
// publikt state + sin egen privata hand. Den kan alltså inte fuska.
//
// Grundidé: den som går ut på högst slutvärde förlorar. Boten försöker därför
// göra sig av med höga kort tidigt och spara låga kort och 7:or (jokrar) till slutet.
//
// Nivåer:
//  easy   - medel-strategin, men gör ofta slumpmässiga (legala) drag och synar sällan.
//  medium - heuristik: minimera uppskattat slutvärde för korten som blir kvar.
//  hard   - Monte Carlo i stickspelet: gissar motståndarnas dolda kort utifrån det som
//           är publikt, spelar ut resten av rundan med spelmotorns egna regler och väljer
//           draget med bäst förväntat resultat i kronor.

import {
  evaluateCombination, compareCombinations, calculateFinalValue, MIXED,
} from './combination.js';
import { createDeck } from './cards.js';
import { GurschGame, PHASE } from './game.js';

const SEVEN = 7;
const FACE = 11;          // J och uppåt räknas som face cards vid slask

const without = (hand, cards) => hand.filter((c) => !cards.includes(c));

/**
 * Uppskattat slutvärde om de här korten blir kvar till sista sticket.
 * Pessimistiskt för mixed (summan), men det är just därför höga udda kort ska bort.
 */
function restCost(cards) {
  return cards.length ? calculateFinalValue(cards) : 0;
}

// ---- vilka kort är bra? (bekräftat av användaren 2026-09-28) ----
// Bra kort är ess (vinner stick), 7:or (jokrar) och 4 eller lägre (lågt slutvärde). För den som
// leder första sticket (flopvinnaren) är även kort i par eller mer av samma valör bra - de kan
// spelas ut tillsammans. Man vill också ha låga kort att gå ut på.
const LOW = 4;
const ACE = 14;
const MIN_LOW_TO_GO_OUT = 2;

function isGoodCard(card, hand, leads) {
  if (card.rank === ACE || card.rank === SEVEN || card.rank <= LOW) return true;
  return leads && hand.filter((c) => c.rank === card.rank).length >= 2;
}

/** Kort boten vill bli av med, sämst (högst) först. */
function badCards(hand, leads) {
  return hand.filter((c) => !isGoodCard(c, hand, leads)).sort((a, b) => b.rank - a.rank);
}

/** "Väldigt bra hand": bara bra kort och minst två låga kort att gå ut på - då säger boten STAY. */
function isGreatHand(hand, leads) {
  return badCards(hand, leads).length === 0 && hand.filter((c) => c.rank <= LOW).length >= MIN_LOW_TO_GO_OUT;
}

/** Hur många kort boten vill slänga: sina dåliga, eller ett (högsta) om den saknar låga kort. */
function wantedDiscards(hand, leads) {
  if (isGreatHand(hand, leads)) return 0;
  return Math.min(4, Math.max(1, badCards(hand, leads).length));
}

/** Slängordning: dåliga kort först, sedan höga bra kort (ess, par), låga kort, 7:or allra sist. */
function discardOrder(hand, leads) {
  const bad = badCards(hand, leads);
  const keepPriority = (c) => (c.rank === SEVEN ? 2 : c.rank <= LOW ? 1 : 0);   // högre = behålls längre
  const rest = hand.filter((c) => !bad.includes(c)).sort((a, b) => keepPriority(a) - keepPriority(b) || b.rank - a.rank);
  return bad.concat(rest);
}

/** Exporteras för tester: botens bedömning av en hand. */
export const handJudgement = { isGoodCard, badCards, isGreatHand, wantedDiscards, discardOrder };

/** Så dålig är handen att en slask är värd risken (inga låga kort, inga par, ingen 7:a). */
function wantsSlask(hand) {
  const ranks = hand.map((c) => c.rank);
  const hasPair = new Set(ranks).size < ranks.length;
  const hasSeven = ranks.includes(SEVEN);
  const lowest = Math.min(...ranks);
  const faces = hand.filter((c) => c.rank >= FACE).length;
  return !hasPair && !hasSeven && lowest >= 6 && faces <= 2;
}

/** Första slängrundan (turordning): den första väljer antal, övriga matchar eller STAY. */
function chooseDiscard(hand, action, leads) {
  const want = wantedDiscards(hand, leads);
  if (want === 0) return { type: 'stay' };
  const n = action.free ? want : action.count;
  // Ett kort mer än önskat går bra; annars stannar boten (står då över första förhandlingen).
  if (n > want + 1) return { type: 'stay' };
  return { type: 'discard', cardIds: discardOrder(hand, leads).slice(0, n).map((c) => c.id) };
}

/**
 * Slängförhandling i realtid. Alla försöker slänga tills någon har en väldigt bra hand: boten
 * föreslår så många kort som den vill bli av med och går gärna med på de andras förslag.
 * STAY säger den bara med en väldigt bra hand (se isGreatHand).
 */
function chooseNegotiation(pub, hand, botId, rng, level) {
  const n = pub.negotiation;
  const mine = n.proposals[botId];
  const propose = (count) => (count === mine ? null : { type: 'propose', count });
  // [R16] Förhandlingarna har inget tak, så bottarna tröttnar själva efter några varv.
  // Annars kan ett rum med bara bottar förhandla för evigt.
  if (n.number > 3 && rng() < Math.min(1, (n.number - 3) * 0.2)) return { type: 'stay' };
  if (level === 'easy' && rng() < 0.3) return propose(1 + Math.floor(rng() * 4));

  const leads = pub.flopWinnerId === botId;
  const want = wantedDiscards(hand, leads);
  if (want === 0) return { type: 'stay' };
  const others = n.participants.filter((id) => id !== botId).map((id) => n.proposals[id]).filter((v) => v !== null);
  const tolerance = level === 'easy' ? 2 : 1;
  const acceptable = others.filter((c) => c <= want + tolerance);
  if (!acceptable.length) return propose(want);
  // Gå mot det vanligaste acceptabla förslaget; vid lika det som ligger närmast önskat antal.
  const votes = new Map();
  for (const c of acceptable) votes.set(c, (votes.get(c) || 0) + 1);
  const [target] = [...votes].sort((a, b) => b[1] - a[1] || Math.abs(a[0] - want) - Math.abs(b[0] - want))[0];
  return propose(target);
}

/** Kortval efter enighet: slängordningen (dåliga kort först, 7:or och låga kort sist). */
function chooseDiscardSelection(hand, count, leads) {
  return discardOrder(hand, leads).slice(0, count);
}

/** Utspel: välj den kombination som lämnar billigast rest, med bonus för stark ledning. */
function chooseLead(hand, leads, rng) {
  // Fem lika (quint) = direkt utgång, kan aldrig förlora.
  const quint = leads.find((l) => l.length === 5);
  if (quint) return quint;

  let best = null;
  for (const lead of leads) {
    const rest = without(hand, lead);
    let cost;
    if (rest.length === 0) {
      cost = calculateFinalValue(lead);            // alla går ut nu på hela sin hand
    } else {
      const strength = evaluateCombination(lead).trickValue / 14;
      cost = restCost(rest) - 1.5 * strength;      // vinner man sticket får man leda igen
    }
    cost += rng() * 0.5;                            // lite variation
    if (!best || cost < best.cost) best = { cards: lead, cost };
  }
  return best.cards;
}

/** Följ ett stick. `options` = motorns lista över lagliga spel (följregeln). */
function chooseFollow(hand, options, leading, rng) {
  let best = null;
  for (const cards of options) {
    const rest = without(hand, cards);
    let cost;
    if (rest.length === 0) {
      cost = calculateFinalValue(cards);           // sista sticket: det här är slutvärdet
    } else {
      cost = restCost(rest);
      const wins = evaluateCombination(cards).type !== MIXED
        && (!leading || compareCombinations(cards, leading.cards) >= 0);   // sist lagd vinner lika
      if (wins) cost -= 1.5;
    }
    cost += rng() * 0.5;
    if (!best || cost < best.cost) best = { cards, cost };
  }
  return best.cards;
}

// ------------------------------------------------------------------ easy

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

function shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Ett slumpat legalt drag - lätt-botens "slarv". */
function randomAction(hand, actions, rng) {
  const discard = actions.find((a) => a.type === 'discard');
  if (discard && rng() < 0.5) {
    const n = discard.free ? 1 + Math.floor(rng() * 3) : discard.count;
    return { type: 'discard', cardIds: shuffled(hand, rng).slice(0, n).map((c) => c.id) };
  }
  const play = actions.find((a) => a.type === 'play');
  if (play) return { type: 'play', cardIds: pick(play.options, rng) };
  const passive = actions.find((a) => a.type === 'stay' || a.type === 'pass');
  return passive ? { type: passive.type } : null;
}

// ------------------------------------------------------------------ hard

/** Kort som boten vet var de är: egen hand, synliga kort, spelade kort. Resten är okända. */
function unknownCards(pub, hand) {
  const known = new Set(hand.map((c) => c.id));
  for (const p of pub.players) for (const c of p.visibleCards) known.add(c.id);
  for (const c of pub.trick.played ?? []) known.add(c.id);
  for (const play of pub.trick.plays) for (const c of play.cards) known.add(c.id);
  return createDeck().filter((c) => !known.has(c.id));
}

// Uppmätt i simulering (svår mot 3×medel, 2 400 rundor): utan viktning förlorar svår
// 28,7 % av rundorna, med LOW_BIAS 1,5–2,5 ca 22 %. Fler än 40 simuleringar hjälpte inte.
const SAMPLES = 40;
const LOW_BIAS = 2;

/**
 * Viktad blandning (Efraimidis–Spirakis): kort med högre vikt hamnar oftare först.
 * Motståndare har ofta slängt höga kort, så låga kort är troligare i deras händer.
 */
function weightedShuffle(cards, rng) {
  const w = (c) => (c.rank === SEVEN ? 1 + LOW_BIAS : Math.exp(-LOW_BIAS * (c.rank - 8) / 6));
  return cards
    .map((c) => ({ c, key: Math.pow(rng(), 1 / w(c)) }))
    .sort((a, b) => b.key - a.key)
    .map((x) => x.c);
}

/** En gissning ("determinisering") av alla händer som stämmer med publik information. */
function sampleHands(pub, botId, hand, order, rng) {
  const pool = weightedShuffle(unknownCards(pub, hand), rng);
  const hands = new Map();
  for (const id of order) {
    if (id === botId) { hands.set(id, hand.slice()); continue; }
    const p = pub.players.find((x) => x.id === id);
    const hidden = Math.max(0, p.handCount - p.visibleCards.length);
    hands.set(id, p.visibleCards.map((c) => ({ ...c })).concat(pool.splice(0, hidden)));
  }
  return hands;
}

/** Bygger ett simuleringsspel i stickfasen från publikt state + gissade händer. */
function buildSim(pub, hands, order, rng) {
  const trick = pub.trick;
  const g = new GurschGame({ id: 'SIM', rng, settings: { turnSeconds: 0 } });
  for (const id of order) g.addPlayer({ id, nickname: id });
  g.phase = PHASE.TRICK;
  g.round = {
    hands,
    visible: new Map(order.map((id) => [id, new Set()])),
    tricks: [],
    lastPlays: new Map(),
    quintExitPlayerId: null,
    finalValues: null,
    currentTrick: null,
    multiplier: 1,
    dealOrder: order,
    flopWinnerId: trick.leaderId,
  };
  g.startTrick(g.round, trick.leaderId);
  const ct = g.round.currentTrick;
  ct.count = trick.count;
  ct.plays = trick.plays.map((p) => ({ playerId: p.playerId, cards: p.cards }));
  ct.turnIndex = trick.plays.length;
  // Stanna när alla gått ut - resultatet läses direkt, ingen betalning eller mini-gursch.
  g.finishNormalPlay = () => { g.simDone = true; };
  return g;
}

/** Botens resultat i "slutvärdesenheter": vinst V om någon annan förlorar, annars -(n-1)V. */
function payoff(g, pub, botId, order) {
  const r = g.round;
  const candidates = order.filter((id) => id !== r.quintExitPlayerId);
  const values = candidates.map((id) => r.finalValues.get(id));
  const max = Math.max(...values);
  const tied = candidates.filter((id) => r.finalValues.get(id) === max);
  const V = max;   // även i mini-gursch: det man går ut på är det man betalar för
  const n = pub.players.length;
  if (!tied.includes(botId)) return V;
  // Vid lika avgör mini-gursch - räkna det som ett lotteri mellan de lika.
  const k = tied.length;
  return (-(n - 1) * V + (k - 1) * V) / k;
}

function playOut(g, rng) {
  let guard = 0;
  while (!g.simDone && guard++ < 200) {
    const pid = g.currentTurnPlayerId();
    const ctx = g.round;
    const hand = ctx.hands.get(pid);
    const trick = ctx.currentTrick;
    const cards = trick.count === null
      ? chooseLead(hand, g.legalPlays(ctx, pid), rng)
      : chooseFollow(hand, g.legalPlays(ctx, pid), g.leadingPlay(trick.plays), rng);
    g.handleAction(pid, { type: 'play', cardIds: cards.map((c) => c.id) });
  }
}

function chooseHardPlay(pub, hand, play, botId, rng) {
  const candidates = optionCards(hand, play);
  const quint = play.lead && candidates.find((l) => l.length === 5);
  if (quint) return quint;
  if (candidates.length === 1) return candidates[0];

  const order = pub.mini ? pub.mini.participants : pub.players.map((p) => p.id);
  // Samma gissningar för alla kandidater, så att skillnaden beror på draget och inte på turen.
  const worlds = Array.from({ length: SAMPLES }, () => sampleHands(pub, botId, hand, order, rng));
  let best = null;
  for (const cards of candidates) {
    let total = 0;
    for (const world of worlds) {
      const hands = new Map([...world].map(([id, h]) => [id, h.slice()]));
      const g = buildSim(pub, hands, order, rng);
      const ids = new Set(cards.map((c) => c.id));
      g.handleAction(botId, { type: 'play', cardIds: hands.get(botId).filter((c) => ids.has(c.id)).map((c) => c.id) });
      playOut(g, rng);
      total += g.simDone ? payoff(g, pub, botId, order) : 0;
    }
    if (!best || total > best.total) best = { cards, total };
  }
  return best.cards;
}

// ------------------------------------------------------------------ val av drag

/** Motorns lagliga spel (id-listor) som kortobjekt ur handen. */
function optionCards(hand, play) {
  const byId = new Map(hand.map((c) => [c.id, c]));
  return play.options.map((ids) => ids.map((id) => byId.get(id)));
}

/**
 * Väljer botens drag.
 *  pub   = game.publicState()
 *  priv  = game.privateState(botId)  -> { hand, actions }
 *  level = 'easy' | 'medium' | 'hard'
 * Returnerar en action ({ type, cardIds? }) eller null om boten inte ska göra något.
 */
export function chooseBotAction({ pub, priv, botId, rng = Math.random, level = 'medium' }) {
  const { hand, actions } = priv;
  // Realtidsfaserna i slängningen
  if (pub.phase === 'NEGOTIATION') {
    return actions.some((a) => a.type === 'propose') ? chooseNegotiation(pub, hand, botId, rng, level) : null;
  }
  if (pub.phase === 'TIEBREAK_DRAW') {
    // [R31] Korten är dolda - ett slumpat val är så bra som det går.
    const pick = actions.find((a) => a.type === 'tiebreakPick');
    return pick ? { type: 'tiebreakPick', index: pick.options[Math.floor(rng() * pick.options.length)] } : null;
  }
  if (pub.phase === 'DISCARD_SELECT') {
    const select = actions.find((a) => a.type === 'discard');
    return select
      ? { type: 'discard', cardIds: chooseDiscardSelection(hand, select.count, pub.flopWinnerId === botId).map((c) => c.id) }
      : null;
  }
  if (level === 'easy' && rng() < 0.45) {
    const action = randomAction(hand, actions, rng);
    if (action) return action;
  }
  const has = (type) => actions.find((a) => a.type === type);
  const me = pub.players.find((p) => p.id === botId);

  if (has('slask') && wantsSlask(hand) && me.slasks < me.maxSlasks && rng() < 0.75) {
    return { type: 'slask' };
  }
  const discard = has('discard');
  if (discard) return chooseDiscard(hand, discard, pub.flopWinnerId === botId);
  if (has('pass')) return { type: 'pass' };

  const play = has('play');
  if (play && level === 'hard' && pub.trick) {
    return { type: 'play', cardIds: chooseHardPlay(pub, hand, play, botId, rng).map((c) => c.id) };
  }
  if (play) {
    const trick = pub.trick;
    const cards = play.lead
      ? chooseLead(hand, optionCards(hand, play), rng)
      : chooseFollow(hand, optionCards(hand, play), trick?.plays.find((p) => p.playerId === trick.leadingPlayerId), rng);
    return { type: 'play', cardIds: cards.map((c) => c.id) };
  }
  if (has('stay')) return { type: 'stay' };
  return null;
}

/**
 * Ska boten syna en slask? Att syna lönar sig i snitt (en slumpad hand har ~1,5 face card,
 * och bara ~15 % saknar face cards helt). Ett synligt face card gör det nästan säkert.
 */
export function shouldCallSlask({ pub, botId, rng = Math.random, level = 'medium' }) {
  const ps = pub.pendingSlask;
  if (!ps || ps.playerId === botId || ps.callerId) return false;
  const slasker = pub.players.find((p) => p.id === ps.playerId);
  const visibleFace = slasker?.visibleCards.some((c) => c.rank >= FACE);
  const chance = {
    easy: visibleFace ? 0.4 : 0.2,
    medium: visibleFace ? 0.9 : 0.55,
    hard: visibleFace ? 1 : 0.8,      // att syna har positivt väntevärde - svår synar nästan alltid
  }[level] ?? 0.55;
  return rng() < chance;
}

/** Reaktionstid (ms) innan en bot synar - lätt är långsam, svår snabbare. */
export function slaskReactionMs(level, rng = Math.random) {
  const base = { easy: 2500, medium: 1200, hard: 900 }[level] ?? 1200;
  return base + rng() * 1500;
}
