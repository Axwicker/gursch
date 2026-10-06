// index.js - HTTP + realtidsserver. All spellogik är server-authoritative.

import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { RoomManager } from './rooms.js';
import { createStore } from './store.js';
import { GameError, BOT_LEVELS } from '../engine/game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '../../public');
const ENGINE_DIR = path.join(__dirname, '../engine');
const REPORTS_DIR = path.join(__dirname, '../../reports');
const PORT = process.env.PORT || 3000;
const HOST_GRACE_MS = 30_000;
const VERSION = JSON.parse(readFileSync(path.join(__dirname, '../../package.json'), 'utf8')).version;
const REPORT_CATEGORIES = ['regel', 'bugg', 'utseende', 'annat'];
const REPORTS_PER_MINUTE = 3;

const store = createStore({ reportsDir: REPORTS_DIR, version: VERSION });
const logError = (room, error) => store.logError({ room: room?.code ?? null, phase: room?.game.phase ?? null, error });
process.on('uncaughtException', (err) => logError(null, err));
process.on('unhandledRejection', (err) => logError(null, err));

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

app.use(express.static(PUBLIC_DIR));
// Klienten importerar kombinationsreglerna härifrån för förhandsvisning av valda kort.
// Servern är fortfarande ensam om att avgöra - samma kod, en sanning.
app.use('/engine', express.static(ENGINE_DIR));
app.get('/health', (_req, res) => res.json({ ok: true, version: VERSION, rooms: manager.rooms.size }));
app.get('/join/:code', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

const manager = new RoomManager({ onBroadcast: (room) => broadcast(room), onError: logError });
setInterval(() => manager.sweep(), 60_000).unref?.();

/** Skickar publikt state till alla och privat state till rätt spelare. */
function broadcast(room) {
  const pub = room.game.publicState();
  const events = room.game.drainEvents();
  for (const [socketId, playerId] of room.sockets) {
    const socket = io.sockets.sockets.get(socketId);
    if (!socket) continue;
    socket.emit('state', {
      code: room.code,
      you: playerId,
      state: pub,
      private: room.game.privateState(playerId),
      events,
      serverTime: Date.now(),   // så att klienten kan räkna nedräkningar trots klockskillnad
    });
  }
  manager.syncGameTimer(room);
  manager.syncBots(room);
}

function ack(cb, payload) { if (typeof cb === 'function') cb(payload); }

function withRoom(socket, cb, fn) {
  const room = manager.getRoom(socket.data.code);
  if (!room) { ack(cb, { error: 'Rummet finns inte' }); return null; }
  const playerId = socket.data.playerId;
  if (!playerId) { ack(cb, { error: 'Du är inte med i rummet' }); return null; }
  try {
    fn(room, playerId);
    broadcast(room);
    ack(cb, { ok: true });
  } catch (err) {
    if (err instanceof GameError) ack(cb, { error: err.message });
    else { logError(room, err); ack(cb, { error: 'Serverfel' }); }
    // State förstörs aldrig av en ogiltig action - skicka ändå ut aktuellt state.
    broadcast(room);
  }
  return room;
}

/** Kopplar bort socketen från ett tidigare rum (t.ex. om spelaren byter rum). */
function detachSocket(socket) {
  const room = manager.getRoom(socket.data.code);
  socket.data.code = null;
  socket.data.playerId = null;
  if (!room) return;
  const playerId = room.sockets.get(socket.id);
  room.sockets.delete(socket.id);
  socket.leave(room.code);
  if (!playerId) return;
  const stillOnline = [...room.sockets.values()].includes(playerId);
  if (!stillOnline) {
    room.game.setConnected(playerId, false);
    // Den som pausade försvann: spelet får inte bli stående.
    if (room.game.paused?.playerId === playerId) room.game.resume(playerId, { force: true });
    // Ge hosten en stund att ladda om sidan innan rollen lämnas över.
    if (room.game.hostId === playerId) {
      setTimeout(() => {
        if (manager.getRoom(room.code) === room && room.game.ensureConnectedHost()) broadcast(room);
      }, HOST_GRACE_MS).unref?.();
    }
  }
  broadcast(room);
}

function attachSocket(socket, room, playerId) {
  // Byter socketen rum eller spelare kopplas den gamla spelaren bort, annars blir den
  // ett "spöke" som räknas som ansluten utan att ha någon socket.
  if (socket.data.code && (socket.data.code !== room.code || socket.data.playerId !== playerId)) {
    detachSocket(socket);
  }
  socket.data.code = room.code;
  socket.data.playerId = playerId;
  room.sockets.set(socket.id, playerId);
  socket.join(room.code);
}

io.on('connection', (socket) => {
  socket.on('createRoom', ({ nickname, settings, bots = 0, botLevel = 'medium' } = {}, cb) => {
    if (!nickname || !String(nickname).trim()) return ack(cb, { error: 'Skriv ett nickname' });
    const room = manager.createRoom(settings || {});
    // Id:t är publikt (syns i state); token är hemlig och krävs för att återansluta.
    const id = randomUUID();
    const token = randomUUID();
    try {
      room.game.addPlayer({ id, nickname: String(nickname).trim() });
    } catch (err) { return ack(cb, { error: err.message }); }
    room.game.hostId = id;
    room.tokens.set(id, token);
    const botCount = Math.min(4, Math.max(0, Math.floor(Number(bots) || 0)));
    const level = BOT_LEVELS.includes(botLevel) ? botLevel : 'medium';
    for (let i = 0; i < botCount; i++) room.game.addBot(id, level);
    attachSocket(socket, room, id);
    ack(cb, { ok: true, code: room.code, playerId: id, token });
    broadcast(room);
  });

  socket.on('joinRoom', ({ code, nickname, playerId, token, reconnectOnly } = {}, cb) => {
    const room = manager.getRoom(code);
    if (!room) return ack(cb, { error: 'Fel rumskod' });
    const game = room.game;
    // Återanslutning kräver rätt token - annars kunde vem som helst ta över
    // en annan spelares plats (och se dess dolda kort) med hjälp av det publika id:t.
    const reconnecting = Boolean(playerId && token && room.tokens.get(playerId) === token
      && game.players.some((p) => p.id === playerId));
    let id = playerId;
    let secret = token;
    if (reconnecting) {
      game.setConnected(id, true);
    } else if (reconnectOnly) {
      // Automatisk återanslutning får aldrig skapa en ny spelare.
      return ack(cb, { error: 'Din plats i rummet finns inte längre - gå med igen' });
    } else {
      if (!nickname || !String(nickname).trim()) return ack(cb, { error: 'Skriv ett nickname' });
      id = randomUUID();
      secret = randomUUID();
      try {
        game.addPlayer({ id, nickname: String(nickname).trim() });
      } catch (err) { return ack(cb, { error: err.message }); }
      room.tokens.set(id, secret);
    }
    attachSocket(socket, room, id);
    ack(cb, { ok: true, code: room.code, playerId: id, token: secret, reconnected: reconnecting });
    broadcast(room);
  });

  socket.on('roomInfo', ({ code } = {}, cb) => {
    const room = manager.getRoom(code);
    if (!room) return ack(cb, { error: 'Fel rumskod' });
    ack(cb, {
      ok: true,
      code: room.code,
      players: room.game.players.map((p) => p.nickname),
      phase: room.game.phase,
    });
  });

  socket.on('action', (action = {}, cb) => {
    withRoom(socket, cb, (room, playerId) => room.game.handleAction(playerId, action));
  });

  socket.on('startGame', (_p, cb) => {
    withRoom(socket, cb, (room, playerId) => room.game.startGame(playerId));
  });

  socket.on('nextRound', (_p, cb) => {
    withRoom(socket, cb, (room, playerId) => room.game.nextRound(playerId));
  });

  socket.on('returnToLobby', (_p, cb) => {
    withRoom(socket, cb, (room, playerId) => room.game.returnToLobby(playerId));
  });

  // Paus medan någon skriver en felrapport (alla timers och bottar står still).
  socket.on('pauseGame', (_p, cb) => {
    withRoom(socket, cb, (room, playerId) => room.game.pause(playerId));
  });

  socket.on('resumeGame', (_p, cb) => {
    withRoom(socket, cb, (room, playerId) => room.game.resume(playerId));
  });

  socket.on('addBot', ({ level = 'medium' } = {}, cb) => {
    withRoom(socket, cb, (room, playerId) => room.game.addBot(playerId, level));
  });

  socket.on('setBotLevel', ({ botId, level } = {}, cb) => {
    withRoom(socket, cb, (room, playerId) => room.game.setBotLevel(playerId, botId, level));
  });

  socket.on('removeBot', ({ botId } = {}, cb) => {
    withRoom(socket, cb, (room, playerId) => room.game.removeBot(playerId, botId));
  });

  socket.on('updateSettings', (settings = {}, cb) => {
    withRoom(socket, cb, (room, playerId) => room.game.updateSettings(playerId, settings));
  });

  socket.on('chat', ({ text } = {}, cb) => {
    withRoom(socket, cb, (room, playerId) => room.game.addChat(playerId, text));
  });

  // Felrapport. Sparas som fil lokalt och i Supabase på betaservern (store.js). Loggen lämnar
  // aldrig servern, så den kan tas även mitt i en runda utan att avslöja någons kort.
  socket.on('submitReport', async ({ description, category } = {}, cb) => {
    const room = manager.getRoom(socket.data.code);
    const playerId = socket.data.playerId;
    if (!room || !playerId) return ack(cb, { error: 'Du är inte med i rummet' });
    const text = String(description ?? '').trim().slice(0, 2000);
    if (!text) return ack(cb, { error: 'Beskriv vad som blev fel' });
    const now = Date.now();
    socket.data.reportTimes = (socket.data.reportTimes ?? []).filter((t) => now - t < 60_000);
    if (socket.data.reportTimes.length >= REPORTS_PER_MINUTE) {
      return ack(cb, { error: 'Vänta en minut innan du skickar fler rapporter' });
    }
    const log = room.game.reportLog();
    if (!log) return ack(cb, { error: 'Det finns ingen runda att rapportera' });
    const report = {
      format: 'gursch-report',
      version: 1,
      appVersion: VERSION,
      category: REPORT_CATEGORIES.includes(category) ? category : 'annat',
      description: text,
      reportedBy: room.game.players.find((p) => p.id === playerId)?.nickname ?? '?',
      room: room.code,
      createdAt: new Date(now).toISOString(),
      phaseWhenReported: room.game.phase,
      log,
    };
    try {
      const { where } = await store.saveReport(report);
      socket.data.reportTimes.push(now);
      console.log(`Felrapport sparad: ${where}`);
      ack(cb, { ok: true });
    } catch (err) {
      logError(room, err);
      ack(cb, { error: 'Kunde inte spara rapporten – försök igen' });
    }
  });

  socket.on('leaveRoom', (_p, cb) => {
    withRoom(socket, cb, (room, playerId) => {
      room.game.removePlayer(playerId);
      room.tokens.delete(playerId);
      room.sockets.delete(socket.id);
      socket.leave(room.code);
      socket.data.code = null;
      socket.data.playerId = null;
    });
  });

  socket.on('disconnect', () => {
    // Spelaren tappas inte - state ligger kvar på servern för reconnect.
    detachSocket(socket);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Gursch ${VERSION} kör på http://localhost:${PORT} (rapporter: ${store.mode === 'supabase' ? 'Supabase' : 'reports/'})`);
});
