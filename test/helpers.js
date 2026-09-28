import { GurschGame, PHASE } from '../src/engine/game.js';

/** Deterministisk rng för tester. */
export function seededRng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const RANK_FROM_LABEL = { J: 11, Q: 12, K: 13, A: 14 };
let uid = 0;

/** "K" | "7" | "10" -> kortobjekt med unikt id */
export function c(labelStr) {
  const rank = RANK_FROM_LABEL[labelStr] ?? Number(labelStr);
  uid += 1;
  return { id: `T${uid}-${labelStr}`, rank, suit: 'S' };
}

export function hand(...labels) {
  return labels.map(c);
}

export function makeGame(nicknames, settings = {}) {
  const game = new GurschGame({ id: 'TEST', settings, rng: seededRng(42) });
  for (const n of nicknames) game.addPlayer({ id: n.toLowerCase(), nickname: n });
  return game;
}

/** Startar en runda och riggar händer + flopvinnare. */
export function rigRound(game, hands, flopWinnerId, phase = PHASE.TRICK) {
  game.startRound();
  const r = game.round;
  for (const [pid, cards] of Object.entries(hands)) {
    r.hands.set(pid, cards.slice());
    r.visible.set(pid, new Set());
  }
  r.flopWinnerId = flopWinnerId;
  r.lastPlays = new Map();
  r.tricks = [];
  r.piles = { draw: [], discard: [] };
  if (phase === PHASE.TRICK) {
    game.phase = PHASE.TRICK;
    game.startTrick(r, flopWinnerId);
  }
  game.drainEvents();
  return r;
}

/**
 * Ett steg i realtidsfaserna (förhandling / kortval), där ingen har turen.
 * decide(playerId, pub, priv) -> action | null. Om ingen agerar (eller efter för många
 * steg i samma fas) flyttas klockan fram till nästa deadline och tick() körs.
 */
export function realtimeStep(g, clock, rng, decide, state = {}) {
  const pub = g.publicState();
  const key = `${g.roundNumber}:${g.phase}:${g.round.discardRound}:${pub.negotiation?.number}`;
  state.steps = state.key === key ? state.steps + 1 : 0;
  state.key = key;
  const ids = (pub.negotiation?.participants ?? pub.discardSelect.participants).slice();
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  if (state.steps < 40) {
    for (const id of ids) {
      const action = decide(id, pub, g.privateState(id));
      if (action) { g.handleAction(id, action); return; }
    }
  }
  const wake = g.nextWakeup();
  if (wake === null) throw new Error(`Realtidsfasen ${g.phase} står still utan deadline`);
  clock.t = Math.max(clock.t, wake);
  if (!g.tick()) throw new Error(`tick() gjorde inget i ${g.phase}`);
}

/** Slumpspelare i realtidsfaserna. */
export function randomRealtimeAction(pub, priv, rng) {
  const select = priv.actions.find((a) => a.type === 'discard');
  if (pub.phase === 'DISCARD_SELECT' && select) {
    const cards = priv.hand.slice().sort(() => rng() - 0.5).slice(0, select.count);
    return { type: 'discard', cardIds: cards.map((c) => c.id) };
  }
  if (pub.phase === 'NEGOTIATION' && priv.actions.length) {
    const roll = rng();
    if (roll < 0.04) return { type: 'stay' };
    // Oftast: gå med på ett förslag som redan finns, så att förhandlingar ibland lyckas.
    const existing = Object.values(pub.negotiation.proposals).filter((v) => v !== null);
    if (roll < 0.5 && existing.length) return { type: 'propose', count: existing[Math.floor(rng() * existing.length)] };
    if (roll < 0.7) return { type: 'propose', count: 1 + Math.floor(rng() * 4) };
  }
  return null;
}
