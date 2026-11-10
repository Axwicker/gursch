// socket.test.js - servern på riktigt: rum, återanslutning och dubbla anrop över Socket.IO.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = '3218';
const URL = `http://localhost:${PORT}`;
let server;
const open = new Set();

before(async () => {
  const env = { ...process.env, PORT };
  for (const key of Object.keys(env)) if (key.startsWith('SUPABASE')) delete env[key];
  server = spawn(process.execPath, ['src/server/index.js'], { cwd: ROOT, env, stdio: 'ignore' });
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${URL}/health`)).ok) return; } catch { /* startar fortfarande */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Servern svarade inte');
});
after(() => {
  for (const s of open) s.close();
  server?.kill();
});

function client() {
  const socket = io(URL, { transports: ['websocket'], reconnection: false, forceNew: true });
  open.add(socket);
  socket.lastState = null;
  socket.on('state', (s) => { socket.lastState = s; });
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}
const call = (socket, event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));
const settle = () => new Promise((r) => setTimeout(r, 80));
const players = async (socket) => { await settle(); return socket.lastState.state.players; };

async function roomWithGuest() {
  const host = await client();
  const created = await call(host, 'createRoom', { nickname: 'Axel' });
  const guest = await client();
  const joined = await call(guest, 'joinRoom', { code: created.code, nickname: 'Erik' });
  assert.ok(joined.ok);
  return { host, guest, created, joined };
}

test('dubbla anrop från samma socket ger en spelare, inte en spökplats', async () => {
  const { host, guest, created, joined } = await roomWithGuest();
  const again = await call(guest, 'joinRoom', { code: created.code, nickname: 'Erik' });
  assert.equal(again.playerId, joined.playerId);
  assert.equal(again.token, joined.token);
  assert.equal((await players(host)).length, 2);
});

test('[A4] återanslutning med rätt token ger platsen tillbaka', async () => {
  const { host, guest, created, joined } = await roomWithGuest();
  guest.close();
  assert.equal((await players(host)).find((p) => p.id === joined.playerId).connected, false);
  const back = await client();
  const res = await call(back, 'joinRoom', { code: created.code, playerId: joined.playerId, token: joined.token, reconnectOnly: true });
  assert.equal(res.reconnected, true);
  assert.equal((await players(host)).find((p) => p.id === joined.playerId).connected, true);
});

test('[A2] fel token kan inte ta över någon annans plats', async () => {
  const { created, joined } = await roomWithGuest();
  const thief = await client();
  const res = await call(thief, 'joinRoom', { code: created.code, playerId: joined.playerId, token: 'gissning', reconnectOnly: true });
  assert.match(res.error, /plats/);
});

test('[A4] en kickad spelare meddelas och kan inte komma tillbaka med sin token', async () => {
  const { host, guest, created, joined } = await roomWithGuest();
  const kicked = new Promise((resolve) => guest.once('kicked', resolve));
  assert.ok((await call(host, 'kickPlayer', { targetId: joined.playerId })).ok);
  await kicked;
  assert.equal((await players(host)).length, 1);
  const res = await call(guest, 'joinRoom', { code: created.code, playerId: joined.playerId, token: joined.token, reconnectOnly: true });
  assert.ok(res.error);
});

test('[A4] bara hosten kan ta bort spelare', async () => {
  const { host, guest, created } = await roomWithGuest();
  assert.ok((await call(guest, 'kickPlayer', { targetId: created.playerId })).error);
  assert.equal((await players(host)).length, 2);
});

test('trasiga anrop ger felmeddelande och servern lever vidare', async () => {
  const { host } = await roomWithGuest();
  assert.ok((await call(host, 'createRoom', null)).error);
  assert.ok((await call(host, 'action', { type: 'play', cardIds: 5 })).error);
  assert.ok((await call(host, 'action', { type: 'play', cardIds: [1, 2] })).error);
  assert.ok((await fetch(`${URL}/health`)).ok);
});

test('health visar serverns skick, och bilder får cache men inte app.js', async () => {
  const health = await (await fetch(`${URL}/health`)).json();
  assert.equal(health.ok, true);
  assert.equal(health.reports, 'file');
  assert.match((await fetch(`${URL}/assets/fatolj.webp`)).headers.get('cache-control'), /max-age=604800/);
  assert.match((await fetch(`${URL}/app.js`)).headers.get('cache-control'), /max-age=0/);
  assert.ok((await fetch(`${URL}/socket.io/socket.io.min.js`)).ok);
});

test('för många försök stoppas', async () => {
  const socket = await client();
  const answers = [];
  for (let i = 0; i < 65; i++) answers.push(await call(socket, 'roomInfo', { code: 'ZZZZ' }));
  assert.equal(answers[0].notFound, true);
  assert.match(answers.at(-1).error, /För många/);
});
