// game.js - Gursch spelmotor. Server-authoritative state machine.
// Reglerna finns ENDAST här, aldrig i UI:t.

import { createDeck, shuffleDeck, drawCards, RANK_LABELS, sortCards, seededRandom } from './cards.js';
import {
  evaluateCombination, compareCombinations, isValidLead, calculateFinalValue,
  isFiveOfAKind, isQuintTwo, MIXED, subsets, followReference, isLegalFollow,
} from './combination.js';
import {
  resolveMultiplier, calculateRoundPayments, calculateSlaskPayment, applyTransactions,
} from './money.js';

export const PHASE = {
  LOBBY: 'LOBBY',
  DEALING: 'DEALING',
  FLOP: 'FLOP',
  INITIAL_DISCARD: 'INITIAL_DISCARD',
  NEGOTIATION: 'NEGOTIATION',         // realtid: alla föreslår 1-4 tills alla är överens
  DISCARD_SELECT: 'DISCARD_SELECT',   // alla väljer samtidigt det överenskomna antalet kort
  FINAL_SLASK: 'FINAL_SLASK',
  TRICK: 'TRICK',
  MINI_GURSCH: 'MINI_GURSCH',
  ROUND_RESULT: 'ROUND_RESULT',
  ENDED: 'ENDED',
};

export const DEFAULT_SETTINGS = {
  multiplierMode: 'fixed',   // 'fixed' | 'flop'
  multiplierValue: 10,       // 1,5,10,25,50,100
  flopMultFactor: 1,         // flopmult xN
  maxSlasks: 3,
  miniGurschCap: 0,          // 0 = obegränsat, annars max antal nivåer
  chatEnabled: true,
  animations: true,
  sound: true,
  slaskCallSeconds: 8,
  turnSeconds: 45,           // turtimer, 0 = av
  negotiationSeconds: 20,    // tid att komma överens i slängförhandlingen
};

const MAX_ROUND_LOGS = 20;
const MAX_PAUSE_MS = 3 * 60 * 1000;  // en paus släpper av sig själv efter 3 minuter           // så många avslutade rundor sparas för felrapporter
const MAX_NEGOTIATIONS = 20;        // säkerhetsspärr mot ändlösa slängrundor
const AGREE_CONFIRM_MS = 2000;       // när alla är överens: så länge hinner man ändra sig
export const REVEAL_MS = 3000;       // [R11] ett ensamt draget kort syns så här länge när det dras
export const BOT_LEVELS = ['easy', 'medium', 'hard'];
const BOT_NAMES = ['Bot Bengt', 'Bot Greta', 'Bot Sixten', 'Bot Majken', 'Bot Doris', 'Bot Ivar'];

// Tillåtna värden per inställning. Allt från klienten valideras mot detta.
const SETTING_RULES = {
  multiplierMode: (v) => ['fixed', 'flop'].includes(v),
  multiplierValue: (v) => [1, 5, 10, 25, 50, 100].includes(v),
  flopMultFactor: (v) => [1, 2, 3, 4].includes(v),
  maxSlasks: (v) => Number.isInteger(v) && v >= 0 && v <= 5,
  miniGurschCap: (v) => Number.isInteger(v) && v >= 0 && v <= 5,
  chatEnabled: (v) => typeof v === 'boolean',
  animations: (v) => typeof v === 'boolean',
  sound: (v) => typeof v === 'boolean',
  slaskCallSeconds: (v) => Number.isInteger(v) && v >= 3 && v <= 30,
  turnSeconds: (v) => v === 0 || (Number.isInteger(v) && v >= 10 && v <= 300),
  negotiationSeconds: (v) => Number.isInteger(v) && v >= 10 && v <= 120,
};

/** Returnerar endast giltiga inställningar; okända nycklar och ogiltiga värden ignoreras. */
export function sanitizeSettings(settings) {
  const clean = {};
  if (!settings || typeof settings !== 'object') return clean;
  for (const [k, v] of Object.entries(settings)) {
    if (SETTING_RULES[k]?.(v)) clean[k] = v;
  }
  return clean;
}

export class GurschGame {
  constructor({ id, hostId = null, settings = {}, rng = Math.random, now = Date.now } = {}) {
    this.id = id;
    this.rng = rng;
    this.now = now;             // injicerbar klocka för tester av timers
    this.hostId = hostId;
    this.settings = { ...DEFAULT_SETTINGS, ...sanitizeSettings(settings) };
    this.players = [];          // seats, medurs ordning
    this.phase = PHASE.LOBBY;
    this.roundNumber = 0;
    this.dealerIndex = 0;
    this.history = [];          // ledger-poster
    this.rounds = [];           // sammanfattningar per runda
    this.chat = [];
    this.round = null;
    this.result = null;
    this.events = [];
    this.pendingSlask = null;
    this.moveCount = 0;         // räknas upp vid varje genomfört drag
    this.turnDeadline = null;   // när den aktuella turen tar slut (ms), eller null
    this.turnKey = null;
    this.roundLogs = new Map(); // avslutade rundors loggar (frö + drag) för felrapporter
    this.inTimer = false;       // drag som görs av tick()/expireSlask() loggas inte separat
    this.paused = null;         // { playerId, since, until } medan någon skriver en felrapport
  }

  // ---------------------------------------------------------------- spelare

  addPlayer({ id, nickname, isBot = false, botLevel = null }) {
    const existing = this.players.find((p) => p.id === id);
    if (existing) { existing.connected = true; return existing; }
    if (this.players.length >= 5) throw new GameError('Rummet är fullt (max 5 spelare)');
    if (this.phase !== PHASE.LOBBY && this.phase !== PHASE.ROUND_RESULT) {
      throw new GameError('Spelet pågår - du kan bara gå med mellan rundor');
    }
    const player = {
      id,
      nickname: String(nickname).slice(0, 16),
      balance: 0,
      connected: true,
      slasks: 0,
      status: null,
      isBot,
      botLevel: isBot ? (botLevel ?? 'medium') : null,
    };
    this.players.push(player);
    if (!this.hostId && !isBot) this.hostId = id;
    return player;
  }

  /** Host lägger till en AI-motspelare (i lobbyn eller mellan rundor). */
  addBot(playerId, level = 'medium') {
    this.requireHost(playerId);
    if (!BOT_LEVELS.includes(level)) throw new GameError('Okänd svårighetsnivå');
    const taken = new Set(this.players.map((p) => p.nickname));
    const nickname = BOT_NAMES.find((n) => !taken.has(n)) ?? `Bot ${this.players.length + 1}`;
    this.botSeq = (this.botSeq || 0) + 1;
    return this.addPlayer({
      id: `bot-${this.botSeq}-${Math.floor(this.rng() * 1e9)}`, nickname, isBot: true, botLevel: level,
    });
  }

  setBotLevel(playerId, botId, level) {
    this.requireHost(playerId);
    const bot = this.players.find((p) => p.id === botId);
    if (!bot?.isBot) throw new GameError('Det är ingen bot');
    if (!BOT_LEVELS.includes(level)) throw new GameError('Okänd svårighetsnivå');
    bot.botLevel = level;
  }

  removeBot(playerId, botId) {
    this.requireHost(playerId);
    const bot = this.players.find((p) => p.id === botId);
    if (!bot?.isBot) throw new GameError('Det är ingen bot');
    this.removePlayer(botId);
  }

  removePlayer(id) {
    if (this.phase !== PHASE.LOBBY && this.phase !== PHASE.ROUND_RESULT && this.phase !== PHASE.ENDED) {
      throw new GameError('Du kan inte lämna mitt i en runda');
    }
    const idx = this.players.findIndex((p) => p.id === id);
    if (idx === -1) return;
    this.players.splice(idx, 1);
    // Samma dealer ska ligga kvar om någon före dealern i sittordningen lämnar.
    if (idx < this.dealerIndex) this.dealerIndex -= 1;
    if (this.dealerIndex >= this.players.length) this.dealerIndex = 0;
    if (this.hostId === id) this.hostId = this.nextHostId();
  }

  setConnected(id, connected) {
    const p = this.players.find((x) => x.id === id);
    if (!p) return;
    p.connected = connected;
  }

  /** En frånkopplad host får inte låsa rummet: lämna över till en ansluten spelare. */
  ensureConnectedHost() {
    const host = this.players.find((p) => p.id === this.hostId);
    if (host?.connected) return false;
    const next = this.players.find((p) => p.connected && !p.isBot);
    if (!next) return false;
    this.hostId = next.id;
    return true;
  }

  nextHostId() {
    const humans = this.players.filter((p) => !p.isBot);   // en bot kan aldrig vara host
    return (humans.find((p) => p.connected) ?? humans[0])?.id ?? null;
  }

  player(id) {
    const p = this.players.find((x) => x.id === id);
    if (!p) throw new GameError('Okänd spelare');
    return p;
  }

  updateSettings(playerId, settings) {
    this.requireHost(playerId);
    if (this.phase !== PHASE.LOBBY && this.phase !== PHASE.ROUND_RESULT) {
      throw new GameError('Inställningar kan bara ändras mellan rundor');
    }
    const clean = sanitizeSettings(settings);
    if (Object.keys(clean).length === 0) throw new GameError('Ogiltig inställning');
    Object.assign(this.settings, clean);
  }

  requireHost(playerId) {
    if (playerId !== this.hostId) throw new GameError('Endast host får göra detta');
  }

  // ------------------------------------------------------------ rundstart

  startGame(playerId) {
    this.requireHost(playerId);
    if (this.phase !== PHASE.LOBBY) throw new GameError('Spelet är redan igång');
    if (this.players.length < 2) throw new GameError('Minst 2 spelare krävs');
    this.startRound();
  }

  /** seed: bara för uppspelning av en loggad runda - annars slumpas ett nytt frö. */
  startRound({ seed = Math.floor(this.rng() * 2 ** 32) } = {}) {
    if (this.players.length < 2) throw new GameError('Minst 2 spelare krävs');
    // All slump i rundan (utdelning, omblandning, mini-gursch) kommer från rundans frö.
    const rng = seededRandom(seed);
    this.roundNumber += 1;
    this.result = null;
    this.pendingSlask = null;
    for (const p of this.players) { p.slasks = 0; p.status = null; }

    const piles = { draw: shuffleDeck(createDeck(), rng), discard: [] };
    const dealOrder = this.rotate(this.players.map((p) => p.id), this.dealerIndex + 1);

    const hands = new Map();
    const visible = new Map();
    for (const id of dealOrder) { hands.set(id, []); visible.set(id, new Set()); }

    // 4 kort face-down till alla, sedan det femte face-up
    for (let i = 0; i < 4; i++) {
      for (const id of dealOrder) hands.get(id).push(drawCards(piles, 1, rng)[0]);
    }
    for (const id of dealOrder) {
      const card = drawCards(piles, 1, rng)[0];
      hands.get(id).push(card);
      visible.get(id).add(card.id);
    }

    // Floppen: högsta face-up-kortet. Vid lika vinner den som fick sitt sist i dealerordningen.
    let flopWinnerId = null;
    let flopRank = -1;
    for (const id of dealOrder) {
      const faceUpCard = hands.get(id).find((c) => visible.get(id).has(c.id));
      if (faceUpCard.rank >= flopRank) { flopRank = faceUpCard.rank; flopWinnerId = id; }
    }

    this.round = {
      number: this.roundNumber,
      seed,
      rng,
      // Allt som behövs för att spela upp rundan igen: frö, startläge och alla drag.
      log: {
        format: 'gursch-round',
        version: 1,
        roundNumber: this.roundNumber,
        seed,
        dealerIndex: this.dealerIndex,
        startedAt: this.now(),
        settings: { ...this.settings },
        players: this.players.map((p) => ({
          id: p.id, nickname: p.nickname, balance: p.balance, isBot: p.isBot, botLevel: p.botLevel,
        })),
        events: [],
        result: null,
      },
      piles,
      hands,
      visible,
      dealOrder,
      flopWinnerId,
      flopRank,
      multiplier: resolveMultiplier(this.settings, flopRank),
      discardRound: 1,
      proposal: { count: null, proposerId: flopWinnerId },
      decisions: new Map(),
      turnOrder: this.rotate(this.players.map((p) => p.id), this.indexOf(flopWinnerId)),
      turnIndex: 0,
      stayedFirstPhase: new Set(),
      tricks: [],
      currentTrick: null,
      lastPlays: new Map(),
      lastTrickWinnerId: null,
      quintExitPlayerId: null,
      finalValues: null,
      mini: null,
      slaskLog: [],
    };

    this.phase = PHASE.INITIAL_DISCARD;
    this.pushEvent({ type: 'deal', round: this.roundNumber });
    this.pushEvent({
      type: 'flop',
      playerId: flopWinnerId,
      rank: flopRank,
      label: RANK_LABELS[flopRank],
      multiplier: this.round.multiplier,
    });
    this.refreshTurnTimer();
  }

  rotate(arr, start) {
    const n = arr.length;
    const s = ((start % n) + n) % n;
    return arr.slice(s).concat(arr.slice(0, s));
  }

  indexOf(playerId) {
    return this.players.findIndex((p) => p.id === playerId);
  }

  // ------------------------------------------------------------- actions

  handleAction(playerId, action) {
    const round = this.round;
    this.dispatch(playerId, action);
    this.moveCount += 1;
    if (!this.inTimer) this.record(round, { playerId, action: cleanAction(action) });
    this.refreshTurnTimer();
  }

  /** Lägger till en händelse i rundans logg (bara lyckade drag loggas). */
  record(round, entry) {
    round?.log?.events.push({ t: this.now(), ...entry });   // simuleringar har ingen logg
  }

  /** Slaskfönstret stängs av servern (ingen hann syna). Loggas för uppspelning. */
  expireSlask() {
    if (!this.pendingSlask || this.pendingSlask.resolved) return false;
    const round = this.round;
    this.inTimer = true;
    try { this.resolveSlask(); } finally { this.inTimer = false; }
    this.record(round, { expireSlask: true });
    return true;
  }

  /** En avslutad rundas logg (frö + alla drag), för felrapporter. Aldrig för en pågående runda. */
  roundLog(roundNumber) {
    const log = this.roundLogs.get(roundNumber);
    return log ? JSON.parse(JSON.stringify(log)) : null;
  }

  /**
   * Underlag för en felrapport som sparas PÅ SERVERN: den aktuella rundans logg, även om
   * rundan pågår (inProgress). Får aldrig skickas till klienter mitt i en runda.
   */
  reportLog() {
    if (this.round?.log) {
      return { ...JSON.parse(JSON.stringify(this.round.log)), inProgress: this.phase !== PHASE.ROUND_RESULT };
    }
    const last = [...this.roundLogs.keys()].pop();
    return last === undefined ? null : this.roundLog(last);
  }

  dispatch(playerId, action) {
    this.player(playerId);
    if (this.paused) {
      throw new GameError(`Spelet är pausat – ${this.player(this.paused.playerId).nickname} skriver en felrapport`);
    }
    if (this.pendingSlask && !this.pendingSlask.resolved) {
      // Under slaskfönstret är bara CALL SLASK tillåtet.
      if (action.type === 'callSlask') return this.actCallSlask(playerId);
      throw new GameError('Väntar på slaskfönstret');
    }
    switch (action.type) {
      case 'discard': return this.actDiscard(playerId, action.cardIds || []);
      case 'propose': return this.actPropose(playerId, action.count);
      case 'stay': return this.actStay(playerId);
      case 'slask': return this.actSlask(playerId);
      case 'pass': return this.actPassFinalSlask(playerId);
      case 'play': return this.actPlay(playerId, action.cardIds || []);
      case 'callSlask': throw new GameError('Ingen slask att syna');
      default: throw new GameError('Okänd action');
    }
  }

  // ---- turtimer ----------------------------------------------------------

  /**
   * Startar om turtimern när turen går vidare. Ingen timer under slaskfönstret
   * (det har en egen) eller när ingen har turen (lobby, resultat).
   */
  refreshTurnTimer() {
    const turnPlayerId = this.pendingSlask ? null : this.currentTurnPlayerId();
    const seconds = this.settings.turnSeconds;
    if (!turnPlayerId || !seconds || this.phase === PHASE.ROUND_RESULT || this.phase === PHASE.LOBBY) {
      this.turnDeadline = null;
      this.turnKey = null;
      return;
    }
    const key = `${this.roundNumber}:${this.phase}:${turnPlayerId}:${this.moveCount}`;
    if (key === this.turnKey) return;
    this.turnKey = key;
    this.turnDeadline = this.now() + seconds * 1000;
  }

  /** Draget som görs åt en spelare vars tid tagit slut: alltid det passiva alternativet. */
  timeoutAction(playerId) {
    if (this.phase === PHASE.INITIAL_DISCARD) return { type: 'stay' };
    if (this.phase === PHASE.FINAL_SLASK) return { type: 'pass' };
    if (this.phase === PHASE.TRICK || this.phase === PHASE.MINI_GURSCH) {
      // Det lagliga draget med lägst kortsumma: vid utspel ett ensamt lägsta kort.
      const ctx = this.activeTrickState();
      const rankSum = (cards) => cards.reduce((sum, c) => sum + c.rank, 0);
      const plays = this.legalPlays(ctx, playerId)
        .filter((cards) => ctx.currentTrick.count !== null || cards.length === 1);
      const lowest = plays.reduce((best, cards) => (rankSum(cards) < rankSum(best) ? cards : best));
      return { type: 'play', cardIds: lowest.map((c) => c.id) };
    }
    return null;
  }

  /** Anropas av servern när deadline passerat. Returnerar true om ett drag gjordes. */
  expireTurn() {
    if (!this.turnDeadline || this.pendingSlask || this.now() < this.turnDeadline) return false;
    const playerId = this.currentTurnPlayerId();
    const action = playerId && this.timeoutAction(playerId);
    if (!action) { this.refreshTurnTimer(); return false; }
    this.handleAction(playerId, action);
    // Efter draget, så att klientens "tiden tog slut" inte skrivs över av t.ex. STAY-notisen.
    this.pushEvent({ type: 'timeout', playerId, action: action.type });
    return true;
  }

  /**
   * Allt tidsstyrt i motorn: turtimern, förhandlingens timer och bekräftelse samt
   * kortvalets timer. Servern anropar tick() vid nextWakeup(). Returnerar true om något hände.
   */
  tick() {
    if (this.paused) {
      if (this.now() < this.paused.until) return false;
      this.resume(this.paused.playerId, { auto: true });   // säkerhetsspärr: pausen släpper
      return true;
    }
    // [R11] Uppvända dragna kort göms efter REVEAL_MS. Bara synlighet: loggas inte som ett
    // drag och påverkar inget utfall (uppspelningar ger samma resultat med eller utan).
    const hidden = this.expireReveal();
    if (this.pendingSlask) {
      if (this.now() < this.pendingSlask.deadline) return hidden;
      return this.expireSlask() || hidden;      // ingen hann syna
    }
    const round = this.round;
    let changed = false;
    this.inTimer = true;
    try {
      if (this.phase === PHASE.NEGOTIATION) changed = this.tickNegotiation();
      else if (this.phase === PHASE.DISCARD_SELECT) changed = this.tickDiscardSelect();
      else changed = this.expireTurn();
    } finally { this.inTimer = false; }
    if (changed) {
      this.record(round, { tick: true });
      this.moveCount += 1;
      this.refreshTurnTimer();
    }
    return changed || hidden;
  }

  /** [R11] Göm de uppvända dragna korten när deras tid gått ut. */
  expireReveal() {
    const r = this.round;
    if (!r?.revealUntil || this.now() < r.revealUntil) return false;
    this.hideFaceUp();
    return true;
  }

  /**
   * [R5] [R11] Ingen ser längre något uppvänt kort i rundan: floppkortet när första
   * slängrundan är slut, ett draget kort när dess tid gått ut eller rundan går vidare.
   */
  hideFaceUp() {
    const r = this.round;
    if (!r) return;
    for (const set of r.visible.values()) set.clear();
    r.revealUntil = null;
  }

  /** Nästa tidpunkt (ms) då tick() behöver anropas, eller null. */
  nextWakeup() {
    if (this.paused) return this.paused.until;
    if (this.pendingSlask && !this.pendingSlask.resolved) return this.pendingSlask.deadline;
    if (!this.round) return null;
    const reveal = this.round.revealUntil ?? null;
    const soonest = (t) => (reveal && (!t || reveal < t) ? reveal : t);
    if (this.phase === PHASE.NEGOTIATION) return soonest(this.round.negotiation.confirmAt ?? this.round.negotiation.deadline);
    if (this.phase === PHASE.DISCARD_SELECT) return soonest(this.round.discardSelect.deadline);
    return soonest(this.turnDeadline);
  }

  // ---- paus (medan någon skriver en felrapport) --------------------------

  /** Fryser spelet: inga drag, och alla timers står still tills resume(). */
  pause(playerId) {
    const p = this.player(playerId);
    if (p.isBot) throw new GameError('En bot kan inte pausa');
    if (!this.round || this.phase === PHASE.LOBBY || this.phase === PHASE.ROUND_RESULT) {
      throw new GameError('Ingen runda pågår');
    }
    if (this.paused) throw new GameError(`${this.player(this.paused.playerId).nickname} har redan pausat`);
    const now = this.now();
    this.paused = { playerId, since: now, until: now + MAX_PAUSE_MS };
    this.record(this.round, { pause: true, playerId });
    this.pushEvent({ type: 'paused', playerId });
  }

  /**
   * Fortsätter spelet. Alla deadlines flyttas fram med pausens längd, så att ingen
   * förlorar tid. Bara den som pausade kan fortsätta (force: server/säkerhetsspärr).
   */
  resume(playerId, { auto = false, force = false } = {}) {
    if (!this.paused) return false;
    if (!auto && !force && this.paused.playerId !== playerId) {
      throw new GameError('Bara den som pausade kan fortsätta spelet');
    }
    const shift = this.now() - this.paused.since;
    const r = this.round;
    if (this.turnDeadline) this.turnDeadline += shift;
    if (this.pendingSlask) this.pendingSlask.deadline += shift;
    if (r?.negotiation) {
      r.negotiation.deadline += shift;
      if (r.negotiation.confirmAt) r.negotiation.confirmAt += shift;
    }
    if (r?.discardSelect?.deadline) r.discardSelect.deadline += shift;
    if (r?.revealUntil) r.revealUntil += shift;
    const pausedBy = this.paused.playerId;
    this.paused = null;
    this.record(r, { resume: true, playerId: pausedBy, ...(auto ? { auto: true } : {}) });
    this.pushEvent({ type: 'resumed', playerId: pausedBy, auto });
    return true;
  }

  requireTurn(playerId) {
    const r = this.round;
    if (!r) throw new GameError('Ingen aktiv runda');
    const current = this.currentTurnPlayerId();
    if (current !== playerId) throw new GameError('Det är inte din tur');
  }

  currentTurnPlayerId() {
    const r = this.round;
    if (!r) return null;
    if (this.phase === PHASE.NEGOTIATION || this.phase === PHASE.DISCARD_SELECT) return null;   // realtid
    if (this.phase === PHASE.TRICK || this.phase === PHASE.MINI_GURSCH) {
      const t = this.activeTrickState();
      return t.currentTrick ? t.currentTrick.turnOrder[t.currentTrick.turnIndex] ?? null : null;
    }
    return r.turnOrder[r.turnIndex] ?? null;
  }

  // ---- discard -----------------------------------------------------------

  requiredDiscardCount() {
    return this.round?.proposal.count ?? null;
  }

  actDiscard(playerId, cardIds) {
    if (this.phase === PHASE.DISCARD_SELECT) return this.actSelectDiscard(playerId, cardIds);
    this.requireTurn(playerId);
    const r = this.round;
    if (this.phase !== PHASE.INITIAL_DISCARD) throw new GameError('Fel fas för att slänga kort');
    const hand = r.hands.get(playerId);
    const cards = this.resolveOwnedCards(hand, cardIds);
    if (cards.length < 1 || cards.length > 4) throw new GameError('Du måste slänga 1-4 kort');

    if (r.proposal.count === null) {
      r.proposal.count = cards.length;
      r.proposal.proposerId = playerId;
      this.pushEvent({ type: 'proposal', playerId, count: cards.length });
    } else if (cards.length !== r.proposal.count) {
      throw new GameError(`Du måste slänga exakt ${r.proposal.count} kort`);
    }

    r.decisions.set(playerId, { type: 'discard', cardIds: cards.map((c) => c.id) });
    this.player(playerId).status = `${cards.length} KORT`;
    this.advanceDiscardTurn();
  }

  actStay(playerId) {
    if (this.phase === PHASE.NEGOTIATION) return this.actStayNegotiation(playerId);
    this.requireTurn(playerId);
    const r = this.round;
    if (this.phase === PHASE.INITIAL_DISCARD) {
      // STAY i första fasen: spelaren hoppar över NÄSTA slängmöjlighet,
      // men påverkar inte de andras val.
      r.decisions.set(playerId, { type: 'stay' });
      r.stayedFirstPhase.add(playerId);
      this.player(playerId).status = 'STAY';
      this.pushEvent({ type: 'stay', playerId });
      this.advanceDiscardTurn();
      return;
    }
    throw new GameError('Fel fas för STAY');
  }

  actSlask(playerId) {
    this.requireTurn(playerId);
    const r = this.round;
    if (this.phase !== PHASE.INITIAL_DISCARD && this.phase !== PHASE.FINAL_SLASK) {
      throw new GameError('Du får inte slaska nu');
    }
    const p = this.player(playerId);
    if (p.slasks >= this.settings.maxSlasks) throw new GameError(`Max ${this.settings.maxSlasks} slaskar`);

    const oldHand = r.hands.get(playerId).slice();
    p.slasks += 1;
    this.pendingSlask = {
      playerId,
      oldHand,
      callerId: null,
      resolved: false,
      deadline: this.now() + this.settings.slaskCallSeconds * 1000,
      returnPhase: this.phase,
    };
    p.status = 'SLASK';
    this.pushEvent({ type: 'slask', playerId, slasks: p.slasks });
  }

  actCallSlask(playerId) {
    const ps = this.pendingSlask;
    if (!ps || ps.resolved) throw new GameError('Ingen slask att syna');
    if (ps.playerId === playerId) throw new GameError('Du kan inte syna din egen slask');
    if (ps.callerId) throw new GameError('SLASK ALREADY CALLED');
    ps.callerId = playerId;   // först till klick - server avgör
    this.resolveSlask();
  }

  /** Avslutar slaskfönstret (timeout eller efter CALL SLASK). */
  resolveSlask() {
    const ps = this.pendingSlask;
    if (!ps || ps.resolved) return;
    ps.resolved = true;
    const r = this.round;

    if (ps.callerId) {
      const payment = calculateSlaskPayment({
        slaskerId: ps.playerId, callerId: ps.callerId, oldHand: ps.oldHand,
      });
      const entries = applyTransactions(this.players, payment.txs, {
        round: this.roundNumber, event: 'Slask',
      });
      this.history.push(...entries);
      r.slaskLog.push({
        slaskerId: ps.playerId,
        callerId: ps.callerId,
        faceCards: payment.faceCards,
        amount: payment.amount,
        hand: ps.oldHand.map((c) => RANK_LABELS[c.rank]),
      });
      this.pushEvent({
        type: 'slaskResolved',
        playerId: ps.playerId,
        callerId: ps.callerId,
        faceCards: payment.faceCards,
        amount: payment.amount,
        hand: ps.oldHand.map((c) => RANK_LABELS[c.rank]),
      });
      for (const e of entries) this.pushEvent({ type: 'money', playerId: e.playerId, amount: e.amount });
    } else {
      this.pushEvent({ type: 'slaskResolved', playerId: ps.playerId, callerId: null });
    }

    // Ny hand: gamla korten till discard pile, sedan fem nya. Tar draw pile slut blandas
    // HELA discard pile (även den gamla handen) - samma regel som vid vanlig slängning.
    r.visible.set(ps.playerId, new Set());
    r.piles.discard.push(...ps.oldHand);
    r.hands.set(ps.playerId, drawCards(r.piles, 5, r.rng));

    const phase = ps.returnPhase;
    this.pendingSlask = null;

    // Efter en slask väljer man igen på sin nya hand (R17): i första slängrundan slaska igen,
    // slänga eller STAY; i sista slaskchansen slaska igen eller PASS. Turen går bara vidare
    // av sig själv när man slaskat max antal gånger i sista slaskchansen.
    if (phase === PHASE.FINAL_SLASK && this.player(ps.playerId).slasks >= this.settings.maxSlasks) {
      this.advanceFinalSlask();
    }
    this.moveCount += 1;
    this.refreshTurnTimer();
  }

  advanceDiscardTurn() {
    const r = this.round;
    r.turnIndex += 1;
    while (r.turnIndex < r.turnOrder.length) {
      const id = r.turnOrder[r.turnIndex];
      if (r.decisions.has(id)) { r.turnIndex += 1; continue; }
      return; // nästa spelares tur
    }
    this.executeDiscardRound();
  }

  /** Första slängrundan är klar: dra kort och starta den första förhandlingen. */
  executeDiscardRound() {
    const r = this.round;
    const selections = new Map();
    for (const [playerId, decision] of r.decisions) {
      if (decision.type === 'discard') selections.set(playerId, decision.cardIds);
    }
    this.hideFaceUp();   // [R5] floppkortet syns bara under första slängrundan
    this.applyDiscards(selections);
    r.decisions = new Map();
    // STAY i första fasen => spelaren står över den första förhandlingen, men är med sedan.
    this.startNegotiation(new Set(r.stayedFirstPhase));
  }

  /** Slänger valda kort och drar nya, i ordning med start hos flopvinnaren. */
  applyDiscards(selections) {
    const r = this.round;
    this.hideFaceUp();   // [R11] tidigare dragna kort syns aldrig i nästa slängning
    const drawnPerPlayer = [];
    const order = this.rotate(this.players.map((p) => p.id), this.indexOf(r.flopWinnerId));
    for (const playerId of order) {
      const cardIds = selections.get(playerId);
      if (!cardIds) continue;
      const hand = r.hands.get(playerId);
      const discarded = [];
      for (const cardId of cardIds) {
        const idx = hand.findIndex((c) => c.id === cardId);
        if (idx !== -1) discarded.push(hand.splice(idx, 1)[0]);
        r.visible.get(playerId).delete(cardId);
      }
      // Hela discard pile (även nyss slängda kort) blandas om draw pile tar slut.
      r.piles.discard.push(...discarded);
      const newCards = drawCards(r.piles, discarded.length, r.rng);
      hand.push(...newCards);
      // [R11] Exakt ett draget kort visas uppvänt, men bara en kort stund (REVEAL_MS).
      // 2-4 kort är dolda.
      if (newCards.length === 1) {
        r.visible.get(playerId).add(newCards[0].id);
        r.revealUntil = this.now() + REVEAL_MS;
      }
      drawnPerPlayer.push({ playerId, count: newCards.length, faceUp: newCards.length === 1 });
    }
    this.pushEvent({ type: 'draw', players: drawnPerPlayer, discardRound: r.discardRound });
    r.discardRound += 1;
    for (const p of this.players) p.status = null;
  }

  // ---- slängförhandling (realtid) ------------------------------------------

  /**
   * Alla deltagare föreslår samtidigt 1-4 kort och kan ändra sig. När alla visar samma tal
   * i AGREE_CONFIRM_MS slänger alla så många. STAY avslutar direkt; ingen enighet när
   * tiden tar slut avslutar också. I båda fallen slängs inga kort och spelet börjar.
   */
  startNegotiation(skip = new Set()) {
    const r = this.round;
    r.negotiationCount = (r.negotiationCount || 0) + 1;
    r.discardSelect = null;
    const order = this.rotate(this.players.map((p) => p.id), this.indexOf(r.flopWinnerId));
    const participants = order.filter((id) => !skip.has(id));
    if (participants.length === 0 || r.negotiationCount > MAX_NEGOTIATIONS) {
      r.negotiation = null;
      this.startFinalSlaskWindow();
      return;
    }
    r.negotiation = {
      number: r.negotiationCount,
      participants,
      skipped: order.filter((id) => skip.has(id)),
      proposals: new Map(participants.map((id) => [id, null])),
      deadline: this.now() + this.settings.negotiationSeconds * 1000,
      confirmAt: null,
      agreedCount: null,
    };
    for (const p of this.players) p.status = null;
    this.phase = PHASE.NEGOTIATION;
    this.pushEvent({ type: 'negotiation', number: r.negotiationCount, participants });
  }

  requireNegotiator(playerId) {
    const n = this.round?.negotiation;
    if (this.phase !== PHASE.NEGOTIATION || !n) throw new GameError('Ingen förhandling pågår');
    if (!n.participants.includes(playerId)) throw new GameError('Du står över den här förhandlingen');
    return n;
  }

  actPropose(playerId, count) {
    const n = this.requireNegotiator(playerId);
    if (!Number.isInteger(count) || count < 1 || count > 4) throw new GameError('Föreslå 1-4 kort');
    n.proposals.set(playerId, count);
    this.pushEvent({ type: 'propose', playerId, count });
    this.updateAgreement();
  }

  /** Startar (eller bryter) bekräftelsen när alla visar samma tal. */
  updateAgreement() {
    const n = this.round.negotiation;
    const values = n.participants.map((id) => n.proposals.get(id));
    const agreed = values.every((v) => v !== null && v === values[0]) ? values[0] : null;
    if (agreed !== null && agreed !== n.agreedCount) {
      n.agreedCount = agreed;
      n.confirmAt = this.now() + AGREE_CONFIRM_MS;
      this.pushEvent({ type: 'agreementPending', count: agreed });
    } else if (agreed === null && n.agreedCount !== null) {
      n.agreedCount = null;
      n.confirmAt = null;
      this.pushEvent({ type: 'agreementBroken' });
    }
  }

  actStayNegotiation(playerId) {
    this.requireNegotiator(playerId);
    this.player(playerId).status = 'STAY';
    this.round.negotiation = null;
    this.pushEvent({ type: 'stay', playerId, endsNegotiation: true });
    this.startFinalSlaskWindow();
  }

  tickNegotiation() {
    const r = this.round;
    const n = r.negotiation;
    const now = this.now();
    if (n.confirmAt !== null && now >= n.confirmAt) {
      this.startDiscardSelect(n.agreedCount, n.participants);
      return true;
    }
    // Pågår en bekräftelse när tiden tar slut får den gå klart.
    if (n.confirmAt === null && now >= n.deadline) {
      r.negotiation = null;
      this.pushEvent({ type: 'negotiationFailed' });
      this.startFinalSlaskWindow();
      return true;
    }
    return false;
  }

  startDiscardSelect(count, participants) {
    const r = this.round;
    r.negotiation = null;
    this.hideFaceUp();   // [R11] syns aldrig rundan efter
    const seconds = this.settings.turnSeconds;
    r.discardSelect = {
      count,
      participants,
      selections: new Map(),
      deadline: seconds ? this.now() + seconds * 1000 : null,
    };
    for (const p of this.players) p.status = null;
    this.phase = PHASE.DISCARD_SELECT;
    this.pushEvent({ type: 'negotiationAgreed', count, participants });
  }

  actSelectDiscard(playerId, cardIds) {
    const ds = this.round.discardSelect;
    if (!ds.participants.includes(playerId)) throw new GameError('Du slänger inte den här rundan');
    if (ds.selections.has(playerId)) throw new GameError('Du har redan valt dina kort');
    const cards = this.resolveOwnedCards(this.round.hands.get(playerId), cardIds);
    if (cards.length !== ds.count) throw new GameError(`Du måste slänga exakt ${ds.count} kort`);
    ds.selections.set(playerId, cards.map((c) => c.id));
    this.player(playerId).status = 'KLAR';
    if (ds.participants.every((id) => ds.selections.has(id))) this.finishDiscardSelect();
  }

  /** Kortvalet åt den som inte hann: de högsta korten. */
  autoDiscardSelection(playerId, count) {
    return this.round.hands.get(playerId).slice()
      .sort((a, b) => b.rank - a.rank || a.suit.localeCompare(b.suit))
      .slice(0, count)
      .map((c) => c.id);
  }

  tickDiscardSelect() {
    const ds = this.round.discardSelect;
    if (!ds.deadline || this.now() < ds.deadline) return false;
    for (const id of ds.participants) {
      if (ds.selections.has(id)) continue;
      ds.selections.set(id, this.autoDiscardSelection(id, ds.count));
      this.pushEvent({ type: 'timeout', playerId: id, action: 'discard' });
    }
    this.finishDiscardSelect();
    return true;
  }

  finishDiscardSelect() {
    this.applyDiscards(this.round.discardSelect.selections);
    this.startNegotiation();   // ny förhandling med alla spelare
  }

  startFinalSlaskWindow() {
    const r = this.round;
    this.hideFaceUp();   // [R11] inga uppvända kort efter slängningen - inte heller i stickspelet
    for (const p of this.players) p.status = null;
    r.finalSlaskDone = new Set();
    r.turnOrder = this.rotate(this.players.map((p) => p.id), this.indexOf(r.flopWinnerId));
    r.turnIndex = 0;
    this.phase = PHASE.FINAL_SLASK;
    // Hoppa direkt förbi spelare som inte får slaska mer
    this.skipIneligibleFinalSlask();
  }

  skipIneligibleFinalSlask() {
    const r = this.round;
    while (r.turnIndex < r.turnOrder.length) {
      const p = this.player(r.turnOrder[r.turnIndex]);
      if (p.slasks >= this.settings.maxSlasks) { r.turnIndex += 1; continue; }
      return;
    }
    this.startTrickPhase();
  }

  actPassFinalSlask(playerId) {
    this.requireTurn(playerId);
    if (this.phase !== PHASE.FINAL_SLASK) throw new GameError('Fel fas');
    this.advanceFinalSlask();
  }

  advanceFinalSlask() {
    const r = this.round;
    r.turnIndex += 1;
    this.skipIneligibleFinalSlask();
  }

  // ---- stickspel ---------------------------------------------------------

  startTrickPhase() {
    const r = this.round;
    for (const p of this.players) p.status = null;
    this.phase = PHASE.TRICK;
    this.startTrick(r, r.flopWinnerId);
    this.pushEvent({ type: 'trickPhase', leaderId: r.flopWinnerId });
  }

  /** Returnerar aktiv stickkontext: normalrunda eller mini-gursch. */
  activeTrickState() {
    return this.phase === PHASE.MINI_GURSCH ? this.round.mini : this.round;
  }

  startTrick(ctx, leaderId) {
    const participants = ctx.participants || this.players.map((p) => p.id);
    const order = this.rotate(participants, participants.indexOf(leaderId));
    ctx.currentTrick = { leaderId, count: null, plays: [], turnOrder: order, turnIndex: 0 };
  }

  /** Följregelns jämförelsevärde: utspelet (den som påbörjade sticket), inte den som leder just nu. */
  followReferenceOf(trick) {
    return followReference(trick.plays[0].cards);
  }

  /**
   * ALLA lagliga spel för spelaren i det aktuella sticket - den enda sanningen om vad som
   * får spelas. Servern, bottarna, timern och klienten utgår alla från den här.
   */
  legalPlays(ctx, playerId) {
    const hand = ctx.hands.get(playerId) ?? [];
    const trick = ctx.currentTrick;
    if (!trick) return [];
    const all = subsets(sortCards(hand));
    if (trick.count === null) return all.filter(isValidLead);
    const reference = this.followReferenceOf(trick);
    return all.filter((cards) => cards.length === trick.count && isLegalFollow(hand, cards, reference));
  }

  actPlay(playerId, cardIds) {
    if (this.phase !== PHASE.TRICK && this.phase !== PHASE.MINI_GURSCH) {
      throw new GameError('Stickspelet har inte börjat');
    }
    this.requireTurn(playerId);
    const ctx = this.activeTrickState();
    const trick = ctx.currentTrick;
    const hand = ctx.hands.get(playerId);
    const cards = this.resolveOwnedCards(hand, cardIds);

    if (trick.count === null) {
      if (!isValidLead(cards)) throw new GameError('Utspelet måste vara en giltig kombination (clean eller semi-mixed)');
      if (cards.length > hand.length) throw new GameError('Du har inte så många kort');
      trick.count = cards.length;
    } else if (cards.length !== trick.count) {
      throw new GameError(`Du måste spela exakt ${trick.count} kort`);
    } else {
      const reference = this.followReferenceOf(trick);
      if (!isLegalFollow(hand, cards, reference)) {
        throw new GameError(`Varje kort måste vara en 7:a, minst ${RANK_LABELS[reference]} eller ett av dina lägsta kort`);
      }
    }

    // Ta korten ur handen
    for (const c of cards) {
      const idx = hand.findIndex((x) => x.id === c.id);
      hand.splice(idx, 1);
      ctx.visible?.get(playerId)?.delete(c.id);
    }
    trick.plays.push({ playerId, cards });
    this.pushEvent({ type: 'play', playerId, cards: cards.map((c) => ({ id: c.id, rank: c.rank, suit: c.suit })) });

    // Direkt utgång med five-of-a-kind / quint two
    if (trick.plays.length === 1 && cards.length === 5 && isFiveOfAKind(cards)) {
      ctx.quintExitPlayerId = playerId;
      this.pushEvent({
        type: 'quint',
        playerId,
        quintTwo: isQuintTwo(cards),
      });
      return this.resolveDirectExit(ctx, playerId, cards);
    }

    trick.turnIndex += 1;
    if (trick.turnIndex < trick.turnOrder.length) return;
    this.resolveTrick(ctx);
  }

  /** Den play som vinner sticket om det tog slut nu. Mixed vinner aldrig, sist lagd vinner vid lika. */
  leadingPlay(plays) {
    let winner = null;
    for (const play of plays) {
      if (evaluateCombination(play.cards).type === MIXED) continue;
      if (!winner || compareCombinations(play.cards, winner.cards) >= 0) winner = play;
    }
    return winner ?? plays[0] ?? null;
  }

  resolveTrick(ctx) {
    const trick = ctx.currentTrick;
    const winner = this.leadingPlay(trick.plays);

    ctx.tricks.push({ ...trick, winnerId: winner.playerId });
    ctx.lastTrickWinnerId = winner.playerId;
    for (const play of trick.plays) ctx.lastPlays.set(play.playerId, play.cards);
    this.pushEvent({
      type: 'trickWon',
      playerId: winner.playerId,
      cards: winner.cards.map((c) => ({ id: c.id, rank: c.rank })),
    });

    const participants = ctx.participants || this.players.map((p) => p.id);
    const empty = participants.every((id) => ctx.hands.get(id).length === 0);
    if (empty) {
      // Alla går ut samtidigt - slutvärdet är de kort man gick ut på.
      const finalValues = new Map();
      for (const id of participants) finalValues.set(id, calculateFinalValue(ctx.lastPlays.get(id)));
      ctx.finalValues = finalValues;
      this.finishPlay(ctx);
      return;
    }
    ctx.currentTrick = null;
    this.startTrick(ctx, winner.playerId);
  }

  resolveDirectExit(ctx, quintPlayerId, quintCards) {
    const participants = ctx.participants || this.players.map((p) => p.id);
    const finalValues = new Map();
    for (const id of participants) {
      if (id === quintPlayerId) {
        finalValues.set(id, calculateFinalValue(quintCards));
        ctx.lastPlays.set(id, quintCards);
        continue;
      }
      const hand = ctx.hands.get(id).slice();
      finalValues.set(id, calculateFinalValue(hand));
      ctx.lastPlays.set(id, hand);
      ctx.hands.set(id, []);
    }
    ctx.finalValues = finalValues;
    ctx.hands.set(quintPlayerId, []);
    this.finishPlay(ctx);
  }

  finishPlay(ctx) {
    if (this.phase === PHASE.MINI_GURSCH) return this.finishMiniGursch();
    return this.finishNormalPlay();
  }

  // ---- resultat ----------------------------------------------------------

  finishNormalPlay() {
    const r = this.round;
    const excluded = r.quintExitPlayerId;
    const candidates = this.players
      .map((p) => p.id)
      .filter((id) => id !== excluded);

    const values = new Map(r.finalValues);
    const maxValue = Math.max(...candidates.map((id) => values.get(id)));
    const tied = candidates.filter((id) => values.get(id) === maxValue);

    if (tied.length === 1) {
      return this.settleRound({ loserId: tied[0], loserValue: maxValue, multiplier: r.multiplier });
    }
    // Mini-gursch mellan de som är exakt lika högst
    return this.startMiniGursch(tied, maxValue, r.multiplier, 1);
  }

  startMiniGursch(participants, tiedValue, previousMultiplier, level) {
    const r = this.round;
    const cap = this.settings.miniGurschCap || 0;
    const multiplier = previousMultiplier * participants.length;

    if (cap > 0 && level > cap) {
      // Gränsen nådd: den som fick sitt kort sist i dealerordningen blir loser.
      const inDealOrder = r.dealOrder.filter((id) => participants.includes(id));
      const loserId = inDealOrder[inDealOrder.length - 1];
      return this.settleRound({
        loserId, loserValue: tiedValue, multiplier: previousMultiplier, capReached: true,
      });
    }

    const piles = { draw: shuffleDeck(createDeck(), r.rng), discard: [] };
    const hands = new Map();
    const visible = new Map();
    const dealOrder = r.dealOrder.filter((id) => participants.includes(id));
    for (const id of dealOrder) { hands.set(id, []); visible.set(id, new Set()); }
    for (let i = 0; i < 2; i++) {
      for (const id of dealOrder) hands.get(id).push(drawCards(piles, 1, r.rng)[0]);
    }
    let starterId = null; let bestRank = -1;
    for (const id of dealOrder) {
      const card = drawCards(piles, 1, r.rng)[0];
      hands.get(id).push(card);
      visible.get(id).add(card.id);
      if (card.rank >= bestRank) { bestRank = card.rank; starterId = id; }
    }

    r.mini = {
      level,
      participants: dealOrder,
      tiedValue,
      multiplier,
      piles,
      hands,
      visible,
      lastPlays: new Map(),
      tricks: [],
      currentTrick: null,
      finalValues: null,
      quintExitPlayerId: null,
      starterId,
      starterRank: bestRank,
    };
    this.phase = PHASE.MINI_GURSCH;
    this.startTrick(r.mini, starterId);
    this.pushEvent({
      type: 'miniGursch',
      level,
      participants: dealOrder,
      multiplier,
      starterId,
    });
  }

  finishMiniGursch() {
    const r = this.round;
    const mini = r.mini;
    const excluded = mini.quintExitPlayerId;
    const candidates = mini.participants.filter((id) => id !== excluded);
    const maxValue = Math.max(...candidates.map((id) => mini.finalValues.get(id)));
    const tied = candidates.filter((id) => mini.finalValues.get(id) === maxValue);

    r.miniHistory = r.miniHistory || [];
    r.miniHistory.push({
      level: mini.level,
      participants: mini.participants,
      multiplier: mini.multiplier,
      values: Object.fromEntries(mini.participants.map((id) => [id, mini.finalValues.get(id)])),
    });

    if (tied.length === 1) {
      return this.settleRound({
        loserId: tied[0],
        loserValue: mini.tiedValue,     // rundans slutvärde avgör beloppet
        multiplier: mini.multiplier,
        miniLevel: mini.level,
      });
    }
    return this.startMiniGursch(tied, mini.tiedValue, mini.multiplier, mini.level + 1);
  }

  settleRound({ loserId, loserValue, multiplier, miniLevel = 0, capReached = false }) {
    const r = this.round;
    const playerIds = this.players.map((p) => p.id);
    const txs = calculateRoundPayments({ playerIds, loserId, loserValue, multiplier });
    const entries = applyTransactions(this.players, txs, {
      round: this.roundNumber,
      event: miniLevel ? `Mini-gursch nivå ${miniLevel}` : 'Runda',
    });
    this.history.push(...entries);

    const changeByPlayer = new Map();
    for (const e of entries) changeByPlayer.set(e.playerId, (changeByPlayer.get(e.playerId) || 0) + e.amount);
    const result = {
      round: this.roundNumber,
      multiplier,
      baseMultiplier: r.multiplier,
      loserId,
      loserValue,
      miniLevel,
      capReached,
      quintExitPlayerId: r.quintExitPlayerId,
      miniHistory: r.miniHistory || [],
      slaskLog: r.slaskLog,
      players: this.players.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        finalValue: r.finalValues?.get(p.id) ?? null,
        finalCards: (r.lastPlays.get(p.id) || []).map((c) => ({ id: c.id, rank: c.rank, suit: c.suit })),
        change: changeByPlayer.get(p.id) || 0,
        balance: p.balance,
      })),
    };
    this.result = result;
    this.rounds.push(result);
    r.log.result = {
      loserId, loserValue, multiplier, miniLevel,
      balances: Object.fromEntries(this.players.map((p) => [p.id, p.balance])),
    };
    this.roundLogs.set(this.roundNumber, r.log);
    if (this.roundLogs.size > MAX_ROUND_LOGS) this.roundLogs.delete(this.roundLogs.keys().next().value);
    this.phase = PHASE.ROUND_RESULT;
    for (const p of this.players) p.status = null;
    for (const e of entries) this.pushEvent({ type: 'money', playerId: e.playerId, amount: e.amount });
    this.pushEvent({ type: 'roundResult', loserId, loserValue, multiplier });
  }

  nextRound(playerId) {
    this.requireHost(playerId);
    if (this.phase !== PHASE.ROUND_RESULT) throw new GameError('Rundan är inte klar');
    if (this.players.length < 2) throw new GameError('Minst 2 spelare krävs');
    this.dealerIndex = (this.dealerIndex + 1) % this.players.length;  // dealern flyttas ett steg
    this.startRound();
  }

  returnToLobby(playerId) {
    this.requireHost(playerId);
    if (this.phase !== PHASE.ROUND_RESULT) throw new GameError('Rundan är inte klar');
    this.dealerIndex = (this.dealerIndex + 1) % this.players.length;
    this.round = null;
    this.phase = PHASE.LOBBY;
    this.refreshTurnTimer();
  }

  // ---- hjälp -------------------------------------------------------------

  resolveOwnedCards(hand, cardIds) {
    const unique = new Set(cardIds);
    if (unique.size !== cardIds.length) throw new GameError('Dubbletter i kortvalet');
    const cards = [];
    for (const id of cardIds) {
      const card = hand.find((c) => c.id === id);
      if (!card) throw new GameError('Du äger inte de korten');
      cards.push(card);
    }
    return cards;
  }

  pushEvent(evt) {
    this.events.push({ ...evt, seq: (this.eventSeq = (this.eventSeq || 0) + 1) });
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  addChat(playerId, text) {
    if (!this.settings.chatEnabled) throw new GameError('Chatten är avstängd');
    const p = this.player(playerId);
    const msg = { id: `${Date.now()}-${Math.random()}`, playerId, nickname: p.nickname, text: String(text).slice(0, 300), ts: Date.now() };
    this.chat.push(msg);
    if (this.chat.length > 200) this.chat.shift();
    return msg;
  }

  // ---- state för klienten ------------------------------------------------

  publicState() {
    const r = this.round;
    const ctx = r ? this.activeTrickState() : null;
    const turnPlayerId = this.pendingSlask && !this.pendingSlask.resolved ? null : this.currentTurnPlayerId();
    const inMini = this.phase === PHASE.MINI_GURSCH;

    return {
      id: this.id,
      phase: this.phase,
      hostId: this.hostId,
      settings: this.settings,
      roundNumber: this.roundNumber,
      dealerId: this.players[this.dealerIndex]?.id ?? null,
      multiplier: inMini ? r.mini.multiplier : (r?.multiplier ?? null),
      baseMultiplier: r?.multiplier ?? null,
      flopWinnerId: r?.flopWinnerId ?? null,
      flopRank: r?.flopRank ?? null,
      turnPlayerId,
      players: this.players.map((p, i) => ({
        id: p.id,
        nickname: p.nickname,
        balance: p.balance,
        connected: p.connected,
        slasks: p.slasks,
        maxSlasks: this.settings.maxSlasks,
        status: p.status,
        isDealer: i === this.dealerIndex,
        isHost: p.id === this.hostId,
        isBot: p.isBot,
        botLevel: p.botLevel,
        handCount: r ? (ctx?.hands.get(p.id)?.length ?? r.hands.get(p.id)?.length ?? 0) : 0,
        visibleCards: r ? this.visibleCardsFor(p.id) : [],
        inMini: inMini ? r.mini.participants.includes(p.id) : false,
        decided: this.phase === PHASE.DISCARD_SELECT
          ? r.discardSelect.selections.has(p.id)
          : (r?.decisions?.has(p.id) ?? false),
      })),
      discard: r && this.phase === PHASE.INITIAL_DISCARD ? {
        discardRound: r.discardRound,
        requiredCount: r.proposal.count,
        // Tills någon valt antal är det den som har turen som bestämmer.
        proposerId: r.proposal.count === null ? turnPlayerId : r.proposal.proposerId,
        isFirstPhase: true,
      } : null,
      trick: ctx?.currentTrick ? {
        leaderId: ctx.currentTrick.leaderId,
        count: ctx.currentTrick.count,
        plays: ctx.currentTrick.plays.map((p) => ({
          playerId: p.playerId,
          cards: p.cards.map((c) => ({ id: c.id, rank: c.rank, suit: c.suit })),
        })),
        lastWinnerId: ctx.lastTrickWinnerId ?? null,
        leadingPlayerId: this.leadingPlay(ctx.currentTrick.plays)?.playerId ?? null,
        // Alla kort som spelats i tidigare stick den här rundan - publikt, alla såg dem.
        played: ctx.tricks.flatMap((t) => t.plays.flatMap((p) => p.cards))
          .map((c) => ({ id: c.id, rank: c.rank, suit: c.suit })),
        trickNumber: ctx.tricks.length + 1,
      } : null,
      // Senast avgjorda stick, så att alla hinner se vad som spelades och vem som vann.
      lastTrick: ctx?.tricks?.length ? {
        winnerId: ctx.tricks.at(-1).winnerId,
        plays: ctx.tricks.at(-1).plays.map((p) => ({
          playerId: p.playerId,
          cards: p.cards.map((c) => ({ id: c.id, rank: c.rank, suit: c.suit })),
        })),
      } : null,
      negotiation: this.phase === PHASE.NEGOTIATION ? {
        number: r.negotiation.number,
        participants: r.negotiation.participants,
        skipped: r.negotiation.skipped,
        proposals: Object.fromEntries(r.negotiation.proposals),
        deadline: r.negotiation.deadline,
        confirmAt: r.negotiation.confirmAt,
        agreedCount: r.negotiation.agreedCount,
        seconds: this.settings.negotiationSeconds,
      } : null,
      discardSelect: this.phase === PHASE.DISCARD_SELECT ? {
        count: r.discardSelect.count,
        participants: r.discardSelect.participants,
        done: [...r.discardSelect.selections.keys()],
        deadline: r.discardSelect.deadline,
      } : null,
      mini: inMini ? {
        level: r.mini.level,
        participants: r.mini.participants,
        multiplier: r.mini.multiplier,
        tiedValue: r.mini.tiedValue,
      } : null,
      turnDeadline: this.turnDeadline,
      paused: this.paused ? { ...this.paused } : null,
      // Bara antal - för högarna mitt på bordet (vilka kort som ligger där är hemligt).
      piles: ctx?.piles ? { draw: ctx.piles.draw.length, discard: ctx.piles.discard.length } : null,
      turnSeconds: this.settings.turnSeconds,
      pendingSlask: this.pendingSlask && !this.pendingSlask.resolved ? {
        playerId: this.pendingSlask.playerId,
        deadline: this.pendingSlask.deadline,
        callerId: this.pendingSlask.callerId,
      } : null,
      result: this.result,
      history: this.history.slice(-100),
      rounds: this.rounds.map((x) => ({
        round: x.round, multiplier: x.multiplier, loserId: x.loserId,
        loserValue: x.loserValue, miniLevel: x.miniLevel,
      })),
      chat: this.settings.chatEnabled ? this.chat.slice(-60) : [],
    };
  }

  visibleCardsFor(playerId) {
    const r = this.round;
    const ctx = this.activeTrickState();
    const hands = ctx.hands || r.hands;
    const visible = ctx.visible || r.visible;
    const hand = hands.get(playerId) || [];
    const vis = visible?.get(playerId) || new Set();
    return hand.filter((c) => vis.has(c.id)).map((c) => ({ id: c.id, rank: c.rank, suit: c.suit }));
  }

  /** Privat state - ENDAST spelarens egna kort. */
  privateState(playerId) {
    const r = this.round;
    if (!r) return { hand: [], actions: [] };
    const ctx = this.activeTrickState();
    const hand = (ctx.hands?.get(playerId) ?? r.hands.get(playerId) ?? []).map((c) => ({
      id: c.id, rank: c.rank, suit: c.suit,
      faceUp: (ctx.visible ?? r.visible)?.get(playerId)?.has(c.id) ?? false,
    }));
    return { hand, actions: this.availableActions(playerId) };
  }

  availableActions(playerId) {
    const actions = [];
    const p = this.players.find((x) => x.id === playerId);
    if (!p || !this.round) return actions;

    if (this.paused) return actions;   // allt står still medan någon skriver en felrapport
    if (this.pendingSlask && !this.pendingSlask.resolved) {
      if (this.pendingSlask.playerId !== playerId && !this.pendingSlask.callerId) actions.push({ type: 'callSlask' });
      return actions;
    }
    // Realtidsfaserna har ingen tur - alla deltagare agerar samtidigt.
    if (this.phase === PHASE.NEGOTIATION) {
      const n = this.round.negotiation;
      if (n.participants.includes(playerId)) {
        actions.push({ type: 'propose', current: n.proposals.get(playerId) });
        actions.push({ type: 'stay' });
      }
      return actions;
    }
    if (this.phase === PHASE.DISCARD_SELECT) {
      const ds = this.round.discardSelect;
      if (ds.participants.includes(playerId) && !ds.selections.has(playerId)) {
        actions.push({ type: 'discard', count: ds.count, free: false });
      }
      return actions;
    }
    if (this.currentTurnPlayerId() !== playerId) return actions;

    const r = this.round;
    if (this.phase === PHASE.INITIAL_DISCARD) {
      actions.push({ type: 'discard', count: r.proposal.count, free: r.proposal.count === null });
      actions.push({ type: 'stay' });
      if (p.slasks < this.settings.maxSlasks) actions.push({ type: 'slask' });
    } else if (this.phase === PHASE.FINAL_SLASK) {
      if (p.slasks < this.settings.maxSlasks) actions.push({ type: 'slask' });
      actions.push({ type: 'pass' });
    } else if (this.phase === PHASE.TRICK || this.phase === PHASE.MINI_GURSCH) {
      const ctx = this.activeTrickState();
      const trick = ctx.currentTrick;
      actions.push({
        type: 'play',
        count: trick?.count ?? null,
        lead: trick?.count == null,
        // Följregelns referens (t.ex. 14 om en ensam 7:a leder) och exakt vilka kort som får spelas.
        reference: trick?.count == null ? null : this.followReferenceOf(trick),
        options: this.legalPlays(ctx, playerId).map((cards) => cards.map((c) => c.id)),
      });
    }
    return actions;
  }
}

/** Bara de fält ett drag består av - så att loggen inte kan innehålla något annat. */
function cleanAction(action) {
  const out = { type: action.type };
  if (Array.isArray(action.cardIds)) out.cardIds = action.cardIds.slice();
  if (action.count !== undefined) out.count = action.count;
  return out;
}

export class GameError extends Error {}
