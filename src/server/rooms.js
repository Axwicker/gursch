// rooms.js - rumshantering. Håller spelmotorn och kopplar sockets till spelare.

import { randomInt } from 'node:crypto';
import { GurschGame, PHASE } from '../engine/game.js';
import { seededRandom } from '../engine/cards.js';
import { chooseBotAction, shouldCallSlask, slaskReactionMs } from '../engine/bot.js';
import { tutorialShouldCall } from '../engine/tutorial.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Kryptografiskt säker rng i [0,1) för blandning - Math.random är förutsägbar. */
const secureRng = () => randomInt(2 ** 47) / 2 ** 47;

/**
 * GURSCH_SEED sätts bara av skärmbildsskriptet (scripts/screenshots.js): varje nytt rum får
 * då samma frö, så att samma kort delas ut och bilderna före och efter en ändring går att jämföra.
 */
const roomRng = () => (process.env.GURSCH_SEED ? seededRandom(Number(process.env.GURSCH_SEED)) : secureRng);

export const HOST_GRACE_MS = 30_000;          // [A4] så länge får hosten vara borta innan rollen lämnas över
export const LOBBY_OFFLINE_MS = 2 * 60_000;   // [A4] så länge får en spelare vara borta i lobbyn

export class RoomManager {
  constructor({ onBroadcast, onError } = {}) {
    this.rooms = new Map();          // code -> room
    this.onBroadcast = onBroadcast;  // (room) => void
    this.onError = onError ?? ((_room, err) => console.error(err));   // (room, err) => void
  }

  createCode() {
    let code;
    do {
      code = Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
    } while (this.rooms.has(code));
    return code;
  }

  /** tutorial: { slaskCallsLeft } för övningsrundan, annars null. */
  createRoom(settings = {}, { tutorial = null } = {}) {
    const code = this.createCode();
    const room = {
      code,
      game: new GurschGame({ id: code, settings, rng: roomRng(), tutorial: Boolean(tutorial) }),
      tutorial,
      sockets: new Map(),   // socketId -> playerId
      tokens: new Map(),    // playerId -> hemlig token för återanslutning
      turnTimer: null,
      turnTimerDeadline: null,
      botTimer: null,       // nästa botdrag
      botTurnKey: null,
      botSlaskKey: null,
      botSlaskTimers: [],
      botRealtimeTimers: new Map(),   // botId -> timer i förhandling/kortval
      botRealtimeKeys: new Map(),     // botId -> senast hanterade läge
      createdAt: Date.now(),
    };
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code) {
    return this.rooms.get(String(code || '').toUpperCase().trim());
  }


  /** Håller en timer i takt med spelmotorns turDeadline. När den går ut görs ett automatiskt drag. */
  /**
   * Håller EN timer i takt med spelmotorns nextWakeup() (turtimer, slaskfönstret,
   * förhandlingens timer och bekräftelse, kortvalets timer, pausens säkerhetsspärr).
   * När den går ut anropas game.tick(). Under en paus står allt still.
   */
  syncGameTimer(room) {
    const deadline = room.game.nextWakeup();
    if (deadline === room.turnTimerDeadline) return;
    if (room.turnTimer) clearTimeout(room.turnTimer);
    room.turnTimer = null;
    room.turnTimerDeadline = deadline;
    if (!deadline) return;
    room.turnTimer = setTimeout(() => {
      room.turnTimer = null;
      room.turnTimerDeadline = null;
      try {
        room.game.tick();
      } catch (err) { this.onError(room, err); }
      this.onBroadcast?.(room);   // broadcast synkar timern för nästa deadline
    }, Math.max(0, deadline - Date.now()));
  }

  /**
   * Låter bottar agera. Anropas efter varje broadcast. Varje tur och varje slask
   * hanteras bara en gång, och fördröjningen gör att människor hinner se vad som händer.
   */
  syncBots(room) {
    const g = room.game;
    if (g.paused) {
      // Bottarna väntar. Nycklarna nollställs, så att de funderar på nytt när spelet fortsätter.
      this.clearBotTimers(room);
      return;
    }
    const ps = g.pendingSlask;
    if (ps && !ps.resolved) {
      const key = `${g.roundNumber}:${ps.playerId}:${ps.deadline}`;
      if (room.botSlaskKey === key) return;
      room.botSlaskKey = key;
      const pub = g.publicState();
      const slaskerIsBot = g.players.find((p) => p.id === ps.playerId)?.isBot;
      for (const bot of g.players.filter((p) => p.isBot && p.id !== ps.playerId)) {
        if (room.tutorial && g.roundNumber === 1) {
          // Övningsrundan: en bott (den första) synar spelarens slask, och bara en gång.
          // Efter första rundan spelar bottarna som vanligt.
          if (!tutorialShouldCall({ slaskerIsBot, callsLeft: room.tutorial.slaskCallsLeft })) break;
          room.botSlaskTimers.push(setTimeout(() => this.runBot(room, () => {
            if (g.pendingSlask !== ps || ps.callerId || room.tutorial.slaskCallsLeft <= 0) return;
            g.handleAction(bot.id, { type: 'callSlask' });
            room.tutorial.slaskCallsLeft -= 1;
          }), Math.min(slaskReactionMs(bot.botLevel), Math.max(300, ps.deadline - Date.now() - 300))));
          break;
        }
        if (!shouldCallSlask({ pub, botId: bot.id, level: bot.botLevel })) continue;
        // Reaktionstid minst ~1 s (lätt ~2,5 s) så att människor har en ärlig chans att hinna först.
        const delay = Math.min(slaskReactionMs(bot.botLevel), Math.max(300, ps.deadline - Date.now() - 300));
        room.botSlaskTimers.push(setTimeout(() => this.runBot(room, () => {
          if (g.pendingSlask === ps && !ps.callerId) g.handleAction(bot.id, { type: 'callSlask' });
        }), delay));
      }
      return;
    }

    if (g.phase === PHASE.NEGOTIATION || g.phase === PHASE.DISCARD_SELECT) {
      this.syncRealtimeBots(room);
      return;
    }
    if (g.phase === PHASE.LOBBY || g.phase === PHASE.ROUND_RESULT) return;
    const pid = g.currentTurnPlayerId();
    const bot = pid && g.players.find((p) => p.id === pid && p.isBot);
    if (!bot) return;
    const key = `${g.roundNumber}:${g.phase}:${pid}:${g.moveCount}`;
    if (room.botTurnKey === key) return;
    room.botTurnKey = key;
    clearTimeout(room.botTimer);
    const inTrick = g.phase === PHASE.TRICK || g.phase === PHASE.MINI_GURSCH;
    const delay = (inTrick ? 1000 : 800) + Math.random() * 800;
    room.botTimer = setTimeout(() => this.runBot(room, () => {
      if (`${g.roundNumber}:${g.phase}:${g.currentTurnPlayerId()}:${g.moveCount}` !== key) return;
      const action = chooseBotAction({
        pub: g.publicState(), priv: g.privateState(pid), botId: pid, level: bot.botLevel,
      });
      try {
        if (action) g.handleAction(pid, action);
      } catch (err) {
        // Botten får aldrig låsa spelet: gör det passiva draget istället.
        this.onError(room, err);
        g.handleAction(pid, g.timeoutAction(pid));
      }
    }), delay);
  }

  /**
   * Förhandling och kortval sker samtidigt för alla. Varje bot funderar på nytt när
   * förslagen ändras, efter en fördröjning så att människor hinner se och påverka.
   */
  syncRealtimeBots(room) {
    const g = room.game;
    const pub = g.publicState();
    const neg = pub.negotiation;
    const participants = neg ? neg.participants : pub.discardSelect.participants;
    const key = neg
      ? `neg:${g.roundNumber}:${neg.number}:${JSON.stringify(neg.proposals)}`
      : `sel:${g.roundNumber}:${g.round.discardRound}`;
    for (const bot of g.players.filter((p) => p.isBot && participants.includes(p.id))) {
      if (room.botRealtimeKeys.get(bot.id) === key) continue;
      room.botRealtimeKeys.set(bot.id, key);
      clearTimeout(room.botRealtimeTimers.get(bot.id));
      // Första reaktionen i en förhandling är långsammare så att människor hinner föreslå.
      const first = neg && Object.values(neg.proposals).every((v) => v === null);
      const delay = neg ? (first ? 2500 : 1200) + Math.random() * 2000 : 1000 + Math.random() * 1500;
      const phase = g.phase;
      room.botRealtimeTimers.set(bot.id, setTimeout(() => this.runBot(room, () => {
        if (g.phase !== phase) return;
        const action = chooseBotAction({
          pub: g.publicState(), priv: g.privateState(bot.id), botId: bot.id, level: bot.botLevel,
        });
        if (action) g.handleAction(bot.id, action);
      }), delay));
    }
  }

  clearBotTimers(room) {
    clearTimeout(room.botTimer);
    for (const t of [...room.botSlaskTimers, ...room.botRealtimeTimers.values()]) clearTimeout(t);
    room.botTimer = null;
    room.botSlaskTimers = [];
    room.botRealtimeTimers.clear();
    room.botTurnKey = null;
    room.botSlaskKey = null;
    room.botRealtimeKeys.clear();
  }

  runBot(room, fn) {
    if (this.rooms.get(room.code) !== room || room.game.paused) return;
    try { fn(); } catch (err) { this.onError(room, err); }
    this.onBroadcast?.(room);
  }

  clearTimers(room) {
    clearTimeout(room.turnTimer);
    this.clearBotTimers(room);
  }

  /** Städa tomma rum efter en stund. */
  sweep() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      // [A4] Hosten kan ha försvunnit när ingen annan var ansluten, och spökplatser ska inte blockera rummet.
      const newHost = room.game.ensureConnectedHost(HOST_GRACE_MS);
      const removed = room.game.removeOfflineFromLobby(LOBBY_OFFLINE_MS);
      for (const id of removed) room.tokens.delete(id);
      if (newHost || removed.length) this.onBroadcast?.(room);
      // Bottar räknas inte: ett rum med bara bottar kvar ska städas bort.
      const anyConnected = room.game.players.some((p) => p.connected && !p.isBot);
      if (!anyConnected) {
        room.emptySince = room.emptySince || now;
        if (now - room.emptySince > 1000 * 60 * 60) {
          this.clearTimers(room);
          this.rooms.delete(code);
        }
      } else {
        room.emptySince = null;
      }
    }
  }
}

export { PHASE };
