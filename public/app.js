// app.js - Gursch klient. UI ENDAST: servern avgör allt. Kombinationsreglerna importeras
// från serverns motor enbart för att förhandsvisa det spelaren har markerat.
import {
  evaluateCombination, compareCombinations, calculateFinalValue, describeCombination, MIXED, CLEAN,
} from '/engine/combination.js';

const socket = io();
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

const RANK_LABELS = { 2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A' };
const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' };

const store = {
  get playerId() { return localStorage.getItem('gursch.playerId'); },
  set playerId(v) { localStorage.setItem('gursch.playerId', v); },
  get token() { return localStorage.getItem('gursch.token'); },
  set token(v) { localStorage.setItem('gursch.token', v); },
  get nickname() { return localStorage.getItem('gursch.nick') || ''; },
  set nickname(v) { localStorage.setItem('gursch.nick', v); },
  get room() { return localStorage.getItem('gursch.room'); },
  set room(v) { v ? localStorage.setItem('gursch.room', v) : localStorage.removeItem('gursch.room'); },
};

let S = null;        // publikt state
let P = { hand: [], actions: [] };  // privat state
let me = null;
let code = null;
let selected = new Set();
let lastPhase = null;
let lastRound = 0;
let seenChatId = null;
const chatNodes = new Map();   // meddelande-id -> element
let clockOffset = 0;   // serverns klocka minus vår, för nedräkningar
const serverNow = () => Date.now() + clockOffset;
/** "Nu" för nedräkningar: under en paus står klockan still där pausen började. */
const timerNow = () => (S?.paused ? S.paused.since : serverNow());

// ------------------------------------------------------------------ helpers

function showScreen(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === id);
}
/** Systemmeddelanden (anslutning, fel, kopierat). Spelhändelser visas på bordet, se noteTable/noteSeat. */
function toast(msg, isError = false) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.toggle('error', isError);
  t.classList.add('show');
  clearTimeout(t._t);
  // Lång text får längre tid - ungefär läshastighet, minst 2,6 s.
  t._t = setTimeout(() => t.classList.remove('show'), Math.max(2600, msg.length * 70));
}

/** Läses upp av skärmläsare (visas inte). */
function announce(text) {
  const n = $('sr-status');
  n.textContent = '';
  requestAnimationFrame(() => { n.textContent = text; });
}

/** Senaste spelhändelsen, på bordet under fasens text. Ligger kvar tills den byts ut eller tiden gått. */
let tableNoteTimer = null;
function noteTable(text, ms = 7000) {
  const n = $('table-note');
  n.textContent = text;
  n.classList.add('show');
  clearTimeout(tableNoteTimer);
  tableNoteTimer = setTimeout(() => n.classList.remove('show'), ms);
}

/** En kort notis vid en spelares plats ("Stay", "Tiden tog slut"). Visas i statusraden. */
const seatNotes = new Map();   // spelar-id -> { text, until }
function noteSeat(playerId, text, ms = 4000) {
  seatNotes.set(playerId, { text, until: Date.now() + ms });
  setTimeout(() => { if (S && S.phase !== 'LOBBY') renderSeats(); }, ms + 50);
}
function seatNote(playerId) {
  const n = seatNotes.get(playerId);
  if (n && n.until > Date.now()) return n.text;
  seatNotes.delete(playerId);
  return null;
}
function kr(n) {
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${Math.abs(n).toLocaleString('sv-SE')} kr`;
}
function nickOf(id) { return S?.players.find((p) => p.id === id)?.nickname ?? '?'; }
function animationsOn() { return S ? S.settings.animations : true; }

function emit(event, payload = {}) {
  socket.emit(event, payload, (res) => {
    if (res?.error) toast(res.error, true);
  });
}

// ------------------------------------------------------------------ ljud
let audioCtx = null;
function beep(freq = 440, dur = 0.08, type = 'sine', gain = 0.05) {
  if (!S?.settings.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = gain;
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
  } catch { /* ljud är valfritt */ }
}

// ------------------------------------------------------------------ home

$('btn-create').onclick = () => createRoom(0);
$('btn-practice').onclick = () => createRoom(3, $('practice-level').value);   // eget rum med tre bottar

const LEVEL_TEXT = { easy: 'Lätt', medium: 'Medel', hard: 'Svår' };

function createRoom(bots, botLevel = 'medium') {
  const nickname = $('create-nick').value.trim();
  if (!nickname) return ($('home-error').textContent = 'Skriv ditt namn');
  store.nickname = nickname;
  socket.emit('createRoom', { nickname, settings: {}, bots, botLevel }, (res) => {
    if (res.error) return ($('home-error').textContent = res.error);
    store.playerId = res.playerId; store.token = res.token; store.room = res.code;
    me = res.playerId; code = res.code;
    history.replaceState({}, '', `/join/${res.code}`);
  });
}

$('btn-join').onclick = () => joinRoom($('join-code').value.trim().toUpperCase(), $('join-nick').value.trim());

function joinRoom(roomCode, nickname) {
  if (!roomCode) return ($('home-error').textContent = 'Skriv en rumskod');
  if (!nickname) return ($('home-error').textContent = 'Skriv ditt namn');
  store.nickname = nickname;
  socket.emit('joinRoom', { code: roomCode, nickname, playerId: store.playerId || undefined, token: store.token || undefined }, (res) => {
    if (res.error) return ($('home-error').textContent = res.error);
    store.playerId = res.playerId; store.token = res.token; store.room = res.code;
    me = res.playerId; code = res.code;
    history.replaceState({}, '', `/join/${res.code}`);
  });
}

$('join-code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase(); });

// ------------------------------------------------------------------ lobby

$('btn-copy').onclick = async () => {
  try { await navigator.clipboard.writeText($('lobby-link').value); toast('Länk kopierad'); }
  catch { $('lobby-link').select(); toast('Kopiera länken manuellt'); }
};
$('btn-start').onclick = () => emit('startGame');
$('btn-add-bot').onclick = () => emit('addBot');
$('btn-leave').onclick = () => {
  emit('leaveRoom');
  store.room = null;
  S = null; code = null;
  history.replaceState({}, '', '/');
  showScreen('screen-home');
};

for (const input of document.querySelectorAll('#settings [data-setting]')) {
  input.addEventListener('change', () => {
    if (!S || S.hostId !== me) return;
    const key = input.dataset.setting;
    let payload = {};
    if (key === 'multiplierPreset') {
      const v = input.value;
      payload = v.startsWith('flop:')
        ? { multiplierMode: 'flop', flopMultFactor: Number(v.split(':')[1]) }
        : { multiplierMode: 'fixed', multiplierValue: Number(v) };
    } else if (input.type === 'checkbox') {
      payload[key] = input.checked;
    } else {
      payload[key] = Number(input.value);
    }
    emit('updateSettings', payload);
  });
}

const lobbyNodes = new Map();   // spelar-id -> rad i lobbyn

function renderLobby() {
  $('lobby-code').textContent = code;
  $('lobby-link').value = `${location.origin}/join/${code}`;
  $('chip-code').textContent = code;
  $('lobby-count').textContent = `${S.players.length}/5`;

  const list = $('lobby-players');
  const entries = keyedNodes(lobbyNodes, S.players.map((p) => p.id), () => el('li'));
  entries.forEach(({ node: li, isNew }, i) => {
    const p = S.players[i];
    if (isNew) enter(li, { opacity: 0, transform: 'translateY(6px)' }, { duration: 250 });
    // Innehållet byggs om (taggar, saldo), men raden ligger kvar - ingen ny in-animation.
    li.replaceChildren();
    li.append(el('span', 'nick', p.nickname));
    if (p.isHost) li.append(el('span', 'tag', 'Host'));
    if (p.isBot && S.hostId !== me) li.append(el('span', 'tag tag-bot', `Bot · ${LEVEL_TEXT[p.botLevel] ?? ''}`));
    if (p.isBot && S.hostId === me) {
      li.append(el('span', 'tag tag-bot', 'Bot'));
      const sel = el('select', 'bot-level');
      sel.setAttribute('aria-label', `Nivå för ${p.nickname}`);
      for (const [value, text] of [['easy', 'Lätt'], ['medium', 'Medel'], ['hard', 'Svår']]) {
        const o = el('option', '', text); o.value = value; sel.append(o);
      }
      sel.value = p.botLevel;
      sel.onchange = () => emit('setBotLevel', { botId: p.id, level: sel.value });
      li.append(sel);
    }
    if (p.id === me) li.append(el('span', 'tag tag-you', 'Du'));
    if (!p.connected) li.append(el('span', 'tag', 'Offline'));
    const bal = el('span', `bal ${p.balance > 0 ? 'pos' : p.balance < 0 ? 'neg' : 'zero'}`, kr(p.balance));
    bal.style.marginLeft = 'auto';
    li.append(bal);
    if (p.isBot && S.hostId === me) {
      const rm = el('button', 'btn btn-sm btn-ghost btn-remove-bot', '✕');
      rm.title = `Ta bort ${p.nickname}`;
      rm.setAttribute('aria-label', `Ta bort ${p.nickname}`);
      rm.onclick = () => emit('removeBot', { botId: p.id });
      li.append(rm);
    }
  });
  syncChildren(list, entries.map((e) => e.node));

  const isHost = S.hostId === me;
  $('btn-start').disabled = !isHost || S.players.length < 2;
  $('btn-add-bot').style.display = isHost ? '' : 'none';
  $('btn-add-bot').disabled = S.players.length >= 5;
  $('lobby-hint').textContent = isHost
    ? (S.players.length < 2 ? 'Minst 2 spelare krävs för att starta.' : 'Du är host - starta när alla är på plats.')
    : 'Väntar på att host startar spelet.';

  for (const input of document.querySelectorAll('#settings [data-setting]')) {
    input.disabled = !isHost;
    const key = input.dataset.setting;
    if (key === 'multiplierPreset') {
      input.value = S.settings.multiplierMode === 'flop'
        ? `flop:${S.settings.flopMultFactor}` : String(S.settings.multiplierValue);
    } else if (input.type === 'checkbox') {
      input.checked = Boolean(S.settings[key]);
    } else if (S.settings[key] !== undefined) {
      input.value = String(S.settings[key]);
    }
  }
}

// ------------------------------------------------------------------ kort

function cardNode(card, extraClass = '') {
  const n = el('div', `card ${['H','D'].includes(card.suit) ? 'red' : ''} ${card.rank === 7 ? 'seven' : ''} ${extraClass}`);
  n.dataset.id = card.id;
  n.append(el('div', 'rank', RANK_LABELS[card.rank]));
  const tl = el('div', 'corner tl', `${RANK_LABELS[card.rank]}${SUIT_SYMBOL[card.suit]}`);
  const br = el('div', 'corner br', `${RANK_LABELS[card.rank]}${SUIT_SYMBOL[card.suit]}`);
  n.append(tl, br);
  return n;
}
function backNode(extraClass = '') { return el('div', `card back ${extraClass}`); }

// ------------------------------------------------------------------ stabil rendering
// Element återanvänds mellan uppdateringar (per kort-id, meddelande-id osv.). En in-animation
// körs bara EN gång, när elementet skapas - aldrig för att något annat i spelet ändrades.

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/** Animerar in ett nyskapat element (Web Animations API, bara transform/opacity). */
function enter(node, from, { delay = 0, duration = 280 } = {}) {
  if (!animationsOn() || document.hidden) return;   // dold flik: ingen ser det, visa direkt
  const keyframes = reducedMotion.matches ? [{ opacity: 0 }, { opacity: 1 }] : [from, {}];
  node.animate(keyframes, { duration, delay, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' });
}

/** Lägger barnen i ordningen `nodes` och flyttar bara element som ligger fel. */
function syncChildren(parent, nodes) {
  nodes.forEach((node, i) => {
    if (parent.children[i] !== node) parent.insertBefore(node, parent.children[i] ?? null);
  });
  while (parent.children.length > nodes.length) parent.lastElementChild.remove();
}

/** Återanvänder element per nyckel. create(key) anropas bara för nya nycklar. */
function keyedNodes(cache, keys, create) {
  const wanted = new Set(keys);
  for (const key of cache.keys()) if (!wanted.has(key)) cache.delete(key);
  return keys.map((key) => {
    let node = cache.get(key);
    const isNew = !node;
    if (isNew) { node = create(key); cache.set(key, node); }
    return { node, isNew };
  });
}

// ------------------------------------------------------------------ bord

const SEAT_POS = {
  1: [[50, 86]],
  2: [[50, 86], [50, 13]],
  3: [[50, 86], [13, 36], [87, 36]],
  4: [[50, 86], [10, 50], [50, 12], [90, 50]],
  5: [[50, 86], [9, 58], [27, 14], [73, 14], [91, 58]],
};
// På smala skärmar ryms inte ett ovalt bord: motståndarna läggs på en rad överst,
// sticket i mitten och den egna platsen längst ned (se .seats.strip i CSS).
const isNarrow = () => window.innerWidth <= 560;

function renderSeats() {
  const seats = $('seats');
  seats.innerHTML = '';
  $('seat-me').innerHTML = '';
  const idx = S.players.findIndex((p) => p.id === me);
  const ordered = idx === -1 ? S.players : S.players.slice(idx).concat(S.players.slice(0, idx));
  const strip = isNarrow();
  seats.classList.toggle('strip', strip);
  const pos = SEAT_POS[ordered.length] || SEAT_POS[5];

  ordered.forEach((p, i) => {
    const seat = el('div', 'seat');
    seat.dataset.playerId = p.id;
    if (p.id === me) seat.classList.add('me');
    if (!strip) {
      const [left, top] = pos[i];
      seat.style.left = `${left}%`;
      seat.style.top = `${top}%`;
    }
    if (S.turnPlayerId === p.id) seat.classList.add('turn');
    if (!p.connected) seat.classList.add('disconnected');

    const badge = el('div', 'seat-badge');
    const nick = el('div', 'nick', (p.isBot ? '🤖 ' : '') + p.nickname + (p.id === me ? ' (du)' : ''));
    if (p.isBot) nick.title = `Bot · ${LEVEL_TEXT[p.botLevel] ?? ''}`;
    badge.append(nick);
    badge.append(el('div', `bal ${p.balance > 0 ? 'pos' : p.balance < 0 ? 'neg' : 'zero'}`, kr(p.balance)));
    const status = p.status || (!p.connected ? 'Återansluter…' : (p.decided ? 'Klar' : ''));
    const note = seatNote(p.id);
    const neg = S.negotiation;
    if (neg) {
      // Allas förslag syns i realtid. Ditt eget i guld, de andras neutrala, grönt när alla är överens.
      const proposal = neg.proposals[p.id];
      const chip = neg.participants.includes(p.id)
        ? el('div', `proposal-chip${proposal ? '' : ' empty'}${p.id === me ? ' mine' : ''}${neg.agreedCount ? ' agreed' : ''}`, proposal ? `${proposal} kort` : '…')
        : el('div', 'proposal-chip skipped', 'Står över');
      badge.append(chip);
    } else if (note) {
      badge.append(el('div', 'status note', note));
    } else if (S.discardSelect?.participants.includes(p.id) && !S.discardSelect.done.includes(p.id)) {
      badge.append(el('div', 'status', 'Väljer kort…'));
    } else {
      badge.append(el('div', 'status', status));
    }
    if (S.turnPlayerId === p.id && S.turnDeadline) {
      const timer = el('div', 'turn-timer');
      const bar = el('div', 'turn-timer-bar');
      // Rätt bredd direkt - annars glider stapeln från 100 % vid varje uppdatering.
      bar.style.width = `${countdownFraction() * 100}%`;
      timer.append(bar);
      badge.append(timer);
    }
    seat.append(badge);

    const marks = el('div', 'seat-marks');
    if (p.isDealer) marks.append(el('span', 'mark dealer', 'D'));
    if (S.flopWinnerId === p.id) marks.append(el('span', 'mark flop', 'Flop'));
    if (p.inMini) marks.append(el('span', 'mark mini', 'Mini'));
    if (p.slasks > 0) marks.append(el('span', 'mark', `Slask ${p.slasks}/${p.maxSlasks}`));
    if (marks.children.length) seat.append(marks);

    if (p.id !== me && p.handCount > 0) {
      const cards = el('div', 'seat-cards');
      let shown = 0;
      for (const c of p.visibleCards) { cards.append(cardNode(c)); shown++; }
      for (let k = shown; k < p.handCount; k++) cards.append(backNode());
      seat.append(cards);
    }
    // Smal skärm: den egna platsen ligger längst ned i bordets flöde, under sticket.
    (strip && p.id === me ? $('seat-me') : seats).append(seat);
  });
}

const PHASE_TEXT = {
  DEALING: 'Utdelning',
  FLOP: 'Flop',
  INITIAL_DISCARD: 'Slängning',
  NEGOTIATION: 'Förhandling',
  DISCARD_SELECT: 'Släng kort',
  FINAL_SLASK: 'Sista slaskchansen',
  TRICK: 'Stickspel',
  MINI_GURSCH: 'Mini-gursch',
  ROUND_RESULT: 'Rundan är slut',
  LOBBY: 'Lobby',
};

function renderCenter() {
  $('phase-banner').textContent = PHASE_TEXT[S.phase] || S.phase;
  let sub = '';
  const turn = S.turnPlayerId;
  const yourTurn = turn === me;

  if (S.discard) {
    const d = S.discard;
    if (d.requiredCount === null) {
      sub = `${nickOf(d.proposerId ?? turn)} bestämmer antalet kort`;
    } else {
      sub = `${nickOf(d.proposerId)} valde ${d.requiredCount} kort`;
    }
    if (turn) sub += ` · ${yourTurn ? 'din tur' : `väntar på ${nickOf(turn)}`}`;
  } else if (S.negotiation) {
    const n = S.negotiation;
    sub = n.agreedCount
      ? `Alla överens: ${n.agreedCount} kort – ändra dig nu om du inte vill`
      : 'Kom överens om antal kort (1–4) · stay = spelet börjar';
  } else if (S.discardSelect) {
    const ds = S.discardSelect;
    const waiting = ds.participants.filter((id) => !ds.done.includes(id));
    sub = `Alla slänger ${ds.count} kort · väntar på ${waiting.map((id) => (id === me ? 'dig' : nickOf(id))).join(', ')}`;
  } else if (S.phase === 'FINAL_SLASK') {
    sub = !turn ? '' : yourTurn ? 'Slask eller pass' : `Väntar på ${nickOf(turn)}`;   // ingen tur under slaskfönstret
  } else if (S.phase === 'TRICK' || S.phase === 'MINI_GURSCH') {
    const t = S.trick;
    if (t) {
      const lead = t.count === null ? 'leder sticket' : `spelar ${t.count} kort`;
      sub = turn ? `${yourTurn ? 'Du' : nickOf(turn)} ${lead}` : '';
      if (t.lastWinnerId && t.plays.length === 0) sub += ` · ${nickOf(t.lastWinnerId)} vann förra sticket`;
    }
  } else if (S.phase === 'ROUND_RESULT') {
    sub = `${nickOf(S.result.loserId)} förlorade rundan`;
  }
  $('phase-sub').textContent = sub;

  const foot = [];
  if (S.dealerId) foot.push(`Dealer: ${nickOf(S.dealerId)}`);
  if (S.flopWinnerId) foot.push(`Flop: ${nickOf(S.flopWinnerId)} (${RANK_LABELS[S.flopRank]})`);
  if (S.mini) foot.push(`Mini-gursch nivå ${S.mini.level} · ×${S.mini.multiplier}`);
  if (S.trick) foot.push(`Stick ${S.trick.trickNumber}`);
  $('table-foot').textContent = foot.join('  ·  ');

  $('chip-round').textContent = `Runda ${S.roundNumber}`;
  $('chip-mult').textContent = S.multiplier ? `×${S.multiplier}` : '×?';
  $('chip-code').textContent = code;

  renderPiles();
  renderTrickArea();
}

const trickNodes = new Map();   // "runda:mini:stick:spelare" -> element
const trickCaption = el('div', 'trick-caption', 'Förra sticket');
const centerTimer = el('div', 'turn-timer center-timer');
centerTimer.append(el('div', 'turn-timer-bar'));

function renderTrickArea() {
  const area = $('trick-area');
  const t = S.trick;
  // Visa det pågående sticket, eller det senast avgjorda tills någon leder nästa.
  const showingLast = t && t.plays.length === 0 && S.lastTrick;
  const plays = showingLast ? S.lastTrick.plays : (t?.plays ?? []);
  const leaderId = showingLast ? S.lastTrick.winnerId : t?.leadingPlayerId;
  // Samma nyckel före och efter att sticket avgjorts, så att sista kortet inte animeras två gånger.
  const trickNo = t ? (showingLast ? t.trickNumber - 1 : t.trickNumber) : 0;
  const keyOf = (play) => `${S.roundNumber}:${S.mini?.level ?? 0}:${trickNo}:${play.playerId}`;
  const byKey = new Map(plays.map((play) => [keyOf(play), play]));
  area.classList.toggle('previous', Boolean(showingLast));
  const entries = keyedNodes(trickNodes, [...byKey.keys()], (key) => {
    const play = byKey.get(key);
    const wrap = el('div', 'trick-play');
    wrap.append(el('div', 'who'));
    const cards = el('div', 'cards');
    for (const c of play.cards) cards.append(cardNode(c));
    wrap.append(cards);
    // Vad kombinationen räknas som - så att t.ex. 4,4,7 inte ser ut som en ensam 7:a.
    const text = describeCombination(play.cards);
    if (text !== 'ensamt kort') wrap.append(el('div', `combo${text === 'mixed' ? ' mixed' : ''}`, text));
    return wrap;
  });
  const nodes = entries.map(({ node, isNew }, i) => {
    const play = plays[i];
    if (isNew) enter(node, { opacity: 0, transform: 'translateY(26px) scale(.85)' }, { duration: 300 });
    const leads = play.playerId === leaderId;
    node.classList.toggle('winner', leads);
    node.querySelector('.who').textContent = nickOf(play.playerId) + (leads ? (showingLast ? ' · vann' : ' · leder') : '');
    return node;
  });
  if (showingLast) nodes.push(trickCaption);
  if (S.negotiation || S.discardSelect?.deadline) nodes.push(centerTimer);
  syncChildren(area, nodes);
}

// ------------------------------------------------------------------ hand + actions

function selectedCards() {
  return P.hand.filter((c) => selected.has(c.id));
}

const idKey = (ids) => [...ids].sort().join(',');

/** Är markeringen exakt ett av serverns lagliga spel? */
function isLegalSelection(play) {
  const key = idKey(selected);
  return play.options.some((ids) => idKey(ids) === key);
}

/** Kort som ingår i något lagligt spel - övriga tonas ned när man följer ett stick. */
function playableCardIds(play) {
  return new Set(play.options.flat());
}

function selectionValid(action) {
  const n = selected.size;
  if (action.type === 'discard') return action.free ? (n >= 1 && n <= 4) : n === action.count;
  if (action.type === 'play') return isLegalSelection(action);
  return true;
}

/** Förklarar följregeln när markeringen inte är tillåten. */
function followRuleHint(play) {
  const lead = S.trick?.plays[0]?.cards;
  const leadText = lead ? `Utspel: ${lead.length === 1 ? RANK_LABELS[lead[0].rank] + (lead[0].rank === 7 ? ' (= ess)' : '') : describeCombination(lead)} → ` : '';
  return `${leadText}lägg 7:or, kort som är minst ${RANK_LABELS[play.reference]} eller dina lägsta kort`;
}

/** Beskriver markerade kort i stickspelet: kombination, om den slår sticket, slutvärde. */
function describeSelection(play) {
  const cards = selectedCards();
  if (!cards.length) return '';
  const combo = evaluateCombination(cards);
  const parts = [];
  if (combo.type === MIXED) {
    parts.push(play.lead ? 'mixed – inte ett giltigt utspel' : 'mixed – kan inte vinna');
  } else if (cards.length === 1 && combo.value === 7) {
    parts.push('ensam 7 – lika stark som ess');
  } else {
    parts.push(`${combo.type === CLEAN ? 'clean' : 'semi-mixed'} ${cards.length}×${RANK_LABELS[combo.value]}`);
  }
  if (!play.lead && cards.length === play.count && !isLegalSelection(play)) {
    const rule = followRuleHint(play);
    return `Inte tillåtet – ${rule[0].toLowerCase()}${rule.slice(1)}`;
  }
  const leading = S.trick?.plays.find((p) => p.playerId === S.trick.leadingPlayerId);
  if (!play.lead && leading && cards.length === play.count && combo.type !== MIXED) {
    // Vid exakt lika vinner den som lägger sist - alltså du.
    parts.push(compareCombinations(cards, leading.cards) >= 0 ? 'tar ledningen' : 'slår inte');
  }
  if (cards.length === P.hand.length) parts.push(`slutvärde ${calculateFinalValue(cards)}`);
  return parts.join(' · ');
}

const byRank = (a, b) => a.rank - b.rank || a.suit.localeCompare(b.suit);

const handNodes = new Map();   // kort-id -> element i handen

function canSelectCards() {
  return P.actions.some((a) => a.type === 'discard' || a.type === 'play');
}

function toggleCard(cardId) {
  if (!canSelectCards()) return;
  if (selected.has(cardId)) selected.delete(cardId);
  else selected.add(cardId);
  beep(selected.has(cardId) ? 560 : 400, 0.05, 'triangle', 0.03);
  renderHand(); renderActions();
}

function renderHand() {
  const canSelect = canSelectCards();
  const followPlay = P.actions.find((a) => a.type === 'play' && !a.lead);
  const playable = followPlay ? playableCardIds(followPlay) : null;
  // Sorterad efter valör så att par och sjuor är lätta att hitta.
  const cards = [...P.hand].sort(byRank);
  const byId = new Map(cards.map((c) => [c.id, c]));
  const fx = flightsOn() ? handFx : null;
  handFx = null;
  // Före slängning: var låg korten, och hur såg de ut (för de flygande kopiorna)?
  const before = new Map();
  if (fx === 'draw') {
    for (const [id, node] of handNodes) if (node.isConnected) before.set(id, { rect: rectOf(node), clone: node.cloneNode(true) });
  }
  let arriving = 0;
  const entries = keyedNodes(handNodes, cards.map((c) => c.id), (id) => {
    const node = cardNode(byId.get(id));
    node.onclick = () => toggleCard(id);
    return node;
  });
  const nodes = entries.map(({ node, isNew }, i) => {
    const card = cards[i];
    // Nya kort animeras in - vid utdelning och slängning av flygningarna, annars en kort intoning.
    if (isNew && !fx) enter(node, { opacity: 0, transform: 'translateY(24px) scale(.92)' }, { delay: arriving++ * 55 });
    const blocked = playable && !playable.has(card.id);
    node.classList.toggle('locked', !canSelect);
    node.classList.toggle('unplayable', Boolean(blocked));
    node.title = blocked ? followRuleHint(followPlay) : '';
    node.classList.toggle('faceup-marker', Boolean(card.faceUp));
    node.classList.toggle('selected', selected.has(card.id));
    return node;
  });
  syncChildren($('hand'), nodes);
  if (fx === 'draw') {
    const keep = new Set(cards.map((c) => c.id));
    const removed = [...before].filter(([id]) => !keep.has(id)).map(([, v]) => v);
    const arrived = entries.filter((e) => e.isNew).map((e) => e.node);
    const moved = entries.filter((e) => !e.isNew && before.has(cards[entries.indexOf(e)].id))
      .map((e) => ({ node: e.node, from: before.get(cards[entries.indexOf(e)].id).rect }));
    animateMyDraw(removed, arrived, moved);
  }

  const discard = P.actions.find((a) => a.type === 'discard');
  const play = P.actions.find((a) => a.type === 'play');
  const has = (type) => P.actions.some((a) => a.type === type);
  let hint = 'Dina kort';
  let count = '';
  // Ledtexten säger vad du ska göra just nu. Vilka kort som är tillåtna visar korten själva
  // (gråa = inte tillåtna, enligt serverns legalPlays); regeln förklaras först om du väljer fel.
  if (discard && S.discardSelect) {
    hint = `Välj ${discard.count} kort att slänga – alla slänger lika många`;
  } else if (discard) {
    hint = discard.free
      ? 'Du bestämmer antalet: välj 1–4 kort att slänga – eller stay eller slask'
      : `Släng ${discard.count} kort (${nickOf(S.discard?.proposerId)} valde antalet) – eller stay eller slask`;
  } else if (play) {
    hint = describeSelection(play)
      || (play.lead ? 'Du leder – välj 1–5 kort som bildar en kombination'
        : `Följ ${leadDescription()} med ${play.count} kort – gråa kort får inte läggas`);
  } else if (has('propose')) {
    hint = 'Hur många kort ska alla slänga? Är alla överens slängs de – stay startar spelet direkt';
  } else if (has('pass')) {
    hint = 'Sista chansen att slaska – annars pass';
  } else if (S.negotiation) {
    hint = 'Du står över den här förhandlingen';
  } else if (S.discardSelect) {
    hint = 'Väntar på att alla väljer sina kort';
  } else if (S.turnPlayerId && S.turnPlayerId !== me) {
    hint = `Väntar på ${nickOf(S.turnPlayerId)}`;
  }
  if (discard) count = `${selected.size} av ${discard.free ? '1–4' : discard.count} valda`;
  if (play) count = `${selected.size} av ${play.lead ? '1–5' : play.count} valda`;
  $('hand-hint').textContent = hint;
  $('sel-count').textContent = count;

  // Ditt drag: handraden lyfts fram (färg och kant, ingen layoutändring - flygningarna mäter den).
  const myMove = P.actions.some((a) => a.type !== 'callSlask');
  $('handbar').classList.toggle('my-move', myMove);
  if (myMove && !hadMove) {
    announce(`Din tur. ${hint}`);
    beep(620, 0.07, 'sine', 0.03);
  }
  hadMove = myMove;
}

let hadMove = false;

const SINGLE_NAMES = { 11: 'en knekt', 12: 'en dam', 13: 'en kung', 14: 'ett ess', 7: 'en ensam 7:a (= ess)' };

/** Utspelet i klartext: "två 5:or", "en kung", "en ensam 7:a (= ess)". */
function leadDescription() {
  const lead = S.trick?.plays[0]?.cards;
  if (!lead) return 'utspelet';
  if (lead.length > 1) return describeCombination(lead);
  return SINGLE_NAMES[lead[0].rank] ?? `en ${lead[0].rank}:a`;
}

// Knapparna återanvänds mellan uppdateringar (en per typ av drag). Bottarna skickar nytt
// state hela tiden - att bygga om knapparna skulle ta bort fokus och tangentbordsnavigering.
const actionNodes = new Map();   // actiontyp -> knapp eller knappgrupp
const ACTION_CLASS = { discard: 'btn btn-primary', play: 'btn btn-primary', stay: 'btn', slask: 'btn btn-danger', pass: 'btn' };

/** Knappen säger vad den gör: "Spela 2 kort", "Släng 3 kort". */
function actionLabel(a) {
  const n = selected.size;
  if (a.type === 'discard') { const k = a.free ? n : a.count; return k ? `Släng ${k} kort` : 'Släng'; }
  if (a.type === 'play') { const k = a.lead ? n : a.count; return k ? `Spela ${k} kort` : 'Spela'; }
  return { stay: 'Stay', slask: 'Slask', pass: 'Pass' }[a.type];
}

function createActionNode(type) {
  if (type === 'propose') {
    const group = el('div', 'propose-group');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Föreslå antal kort att slänga');
    for (const count of [1, 2, 3, 4]) {
      const b = el('button', 'btn propose-btn');
      b.dataset.count = count;
      b.append(el('span', 'propose-num', String(count)), el('span', 'propose-votes'));
      b.onclick = () => emit('action', { type: 'propose', count });
      group.append(b);
    }
    return group;
  }
  const b = el('button', ACTION_CLASS[type]);
  b.onclick = () => {
    if (!P.actions.some((a) => a.type === type)) return;
    if (type === 'discard' || type === 'play') {
      emit('action', { type, cardIds: [...selected] });
      selected.clear();
    } else {
      if (type !== 'pass') selected.clear();
      emit('action', { type });
    }
  };
  return b;
}

function renderActions() {
  const acts = P.actions.filter((a) => a.type !== 'callSlask');   // syna slask: i slaskrutan
  const entries = keyedNodes(actionNodes, acts.map((a) => a.type), createActionNode);
  entries.forEach(({ node }, i) => {
    const a = acts[i];
    if (a.type === 'propose') {
      // Varje tal visar hur många av de andra som vill samma (en prick per spelare).
      const proposals = S.negotiation?.proposals ?? {};
      for (const b of node.children) {
        const c = Number(b.dataset.count);
        const votes = Object.entries(proposals).filter(([id, v]) => id !== me && v === c).length;
        b.classList.toggle('btn-primary', a.current === c);
        b.setAttribute('aria-pressed', String(a.current === c));
        b.querySelector('.propose-votes').textContent = '•'.repeat(votes);
        b.setAttribute('aria-label', `${c} kort${votes ? `, ${votes} ${votes === 1 ? 'annan vill' : 'andra vill'} samma` : ''}`);
      }
      return;
    }
    node.textContent = actionLabel(a);
    if (a.type === 'discard' || a.type === 'play') node.disabled = !selectionValid(a);
  });
  syncChildren($('actions'), entries.map((e) => e.node));
}

// ------------------------------------------------------------------ slask overlay

let slaskInterval = null;
function renderSlask() {
  const overlay = $('slask-overlay');
  const ps = S.pendingSlask;
  if (!ps) {
    overlay.classList.remove('open');
    clearInterval(slaskInterval); slaskInterval = null;
    return;
  }
  const isNew = !overlay.classList.contains('open') || overlay.dataset.key !== String(ps.deadline);
  overlay.classList.add('open');
  overlay.dataset.key = String(ps.deadline);
  const isMine = ps.playerId === me;
  // Det man behöver för att bestämma sig: vem, vad det kostar (money.js) och hur lång tid som är kvar.
  $('slask-text').textContent = ps.callerId
    ? `${nickOf(ps.callerId)} synade ${isMine ? 'dig' : nickOf(ps.playerId)} först.`
    : isMine
      ? 'Du slaskade. Synar någon betalar du 10 kr per face card i din gamla hand – har den inga får du 25 kr.'
      : `${nickOf(ps.playerId)} slaskar. Synar du får du 10 kr per face card i handen – har den inga betalar du 25 kr.`;
  const btn = $('btn-call-slask');
  btn.style.display = isMine || ps.callerId ? 'none' : '';
  if (isNew) btn.disabled = false;   // bara för en ny slask - annars kunde ett andra klick slinka igenom
  btn.textContent = 'Syna slask';
  if (isNew && !isMine) announce(`${nickOf(ps.playerId)} slaskar. Syna slask?`);

  clearInterval(slaskInterval);
  const total = (S.settings.slaskCallSeconds || 8) * 1000;
  const tick = () => {
    const left = Math.max(0, ps.deadline - timerNow());
    $('slask-bar').style.width = `${(left / total) * 100}%`;
    $('slask-count').textContent = ps.callerId ? '' : `${Math.ceil(left / 1000)} s`;
    if (left <= 0) clearInterval(slaskInterval);
  };
  tick();
  slaskInterval = setInterval(tick, 80);
}
$('btn-call-slask').onclick = (e) => {
  e.currentTarget.disabled = true;   // first click wins - servern avgör
  emit('action', { type: 'callSlask' });
};

// ------------------------------------------------------------------ turtimer

let lastWarnSecond = null;
/** Vilken nedräkning som gäller just nu: tur, förhandling (eller dess bekräftelse) eller kortval. */
function currentCountdown() {
  if (!S || S.pendingSlask) return null;
  const n = S.negotiation;
  if (n) {
    return n.confirmAt
      ? { deadline: n.confirmAt, totalMs: 2000, mine: false, label: `Slänger ${n.agreedCount} kort om` }
      : { deadline: n.deadline, totalMs: n.seconds * 1000, mine: n.participants.includes(me), label: 'Förhandling' };
  }
  const ds = S.discardSelect;
  if (ds?.deadline) {
    return { deadline: ds.deadline, totalMs: S.turnSeconds * 1000, mine: ds.participants.includes(me) && !ds.done.includes(me), label: 'Välj kort' };
  }
  if (!S.turnDeadline) return null;
  const mine = S.turnPlayerId === me;
  return { deadline: S.turnDeadline, totalMs: S.turnSeconds * 1000, mine, label: mine ? 'Din tur' : nickOf(S.turnPlayerId) };
}

function countdownFraction() {
  const cd = currentCountdown();
  return cd ? Math.min(1, Math.max(0, cd.deadline - timerNow()) / (cd.totalMs || 1)) : 0;
}

function tickTurnTimer() {
  const clock = $('turn-clock');
  const handBar = $('hand-timer-bar');
  const cd = currentCountdown();
  if (!cd) {
    clock.textContent = '';
    clock.classList.remove('urgent');
    handBar.style.width = '0';
    return;
  }
  const leftMs = Math.max(0, cd.deadline - timerNow());
  const secs = Math.ceil(leftMs / 1000);
  const frac = Math.min(1, leftMs / (cd.totalMs || 1));
  const urgent = secs <= (cd.totalMs <= 2000 ? 2 : 10);
  for (const bar of document.querySelectorAll('.turn-timer-bar')) {
    bar.style.width = `${frac * 100}%`;
    bar.classList.toggle('urgent', urgent);
  }
  const mine = cd.mine;
  // Din egen nedräkning löper också längs handradens överkant.
  handBar.style.width = mine ? `${frac * 100}%` : '0';
  handBar.classList.toggle('urgent', urgent);
  clock.textContent = `${cd.label} · ${secs} s`;
  clock.classList.toggle('urgent', mine && urgent);
  // Varningspip varje sekund de sista fem sekunderna när det är din tur.
  if (mine && secs <= 5 && secs > 0 && secs !== lastWarnSecond) {
    lastWarnSecond = secs;
    beep(880, 0.06, 'square', 0.03);
  }
}
setInterval(tickTurnTimer, 200);

const TIMEOUT_TEXT = { stay: 'stay', pass: 'pass', play: 'lägsta kortet spelades', discard: 'högsta korten slängdes' };

// ------------------------------------------------------------------ chat + history

$('btn-chat-toggle').onclick = () => {
  $('chat-panel').classList.toggle('open');
  $('chat-unread').hidden = true;
  $('chat-input').focus();
};
$('btn-history').onclick = () => $('history-panel').classList.toggle('open');
for (const b of document.querySelectorAll('[data-close]')) b.onclick = () => $(b.dataset.close).classList.remove('open');
$('chat-form').onsubmit = (e) => {
  e.preventDefault();
  const text = $('chat-input').value.trim();
  if (!text) return;
  emit('chat', { text });
  $('chat-input').value = '';
};

function renderChat() {
  $('btn-chat-toggle').style.display = S.settings.chatEnabled ? '' : 'none';
  if (!S.settings.chatEnabled) { $('chat-panel').classList.remove('open'); return; }
  const log = $('chat-log');
  const firstRender = chatNodes.size === 0;
  const byId = new Map(S.chat.map((m) => [m.id, m]));
  const entries = keyedNodes(chatNodes, S.chat.map((m) => m.id), (id) => {
    const m = byId.get(id);
    const div = el('div', 'chat-msg');
    div.append(el('span', 'who', m.nickname + ':'));
    div.append(document.createTextNode(m.text));
    return div;
  });
  let added = false;
  for (const { node, isNew } of entries) {
    if (isNew && !firstRender) { enter(node, { opacity: 0, transform: 'translateY(6px)' }, { duration: 200 }); added = true; }
  }
  syncChildren(log, entries.map((e) => e.node));
  if (added || firstRender) log.scrollTop = log.scrollHeight;
  const lastId = S.chat.at(-1)?.id ?? null;
  if (lastId && seenChatId !== null && lastId !== seenChatId && !$('chat-panel').classList.contains('open')) {
    beep(700, 0.05, 'sine', 0.025);
    $('chat-unread').hidden = false;
  }
  seenChatId = lastId;
}

function renderHistory() {
  const box = $('history');
  box.innerHTML = '';
  if (!S.history.length) { box.append(el('p', 'hint', 'Inga transaktioner än.')); return; }
  let currentRound = null;
  for (const h of [...S.history].reverse()) {
    if (h.round !== currentRound) {
      currentRound = h.round;
      box.append(el('div', 'hist-round', `Runda ${h.round}`));
    }
    const row = el('div', 'hist-row');
    row.append(el('div', '', `${h.nickname} · ${h.event}`));
    const amt = el('div', 'amt', kr(h.amount));
    amt.style.color = h.amount >= 0 ? 'var(--green)' : 'var(--red)';
    row.append(amt);
    row.append(el('div', 'sub', `${h.note || ''} → saldo ${kr(h.balanceAfter)}`));
    box.append(row);
  }
}

// ------------------------------------------------------------------ resultat

$('btn-play-again').onclick = () => emit('nextRound');

// ---- felrapport: sparas på servern (reports/) med rundans logg - går även mitt i en runda ----
let iPaused = false;   // pausade jag spelet när rapportrutan öppnades?

function openReport() {
  $('report-round').textContent = S.result?.round ?? S.roundNumber;
  $('report-overlay').classList.add('open');
  $('report-text').focus();
  // Pausa spelet för alla medan rapporten skrivs, så att ingen tid eller tur går förlorad.
  if (S.phase !== 'LOBBY' && S.phase !== 'ROUND_RESULT' && !S.paused) {
    socket.emit('pauseGame', {}, (res) => {
      iPaused = Boolean(res?.ok);
      if (res?.error) toast(res.error, true);
    });
  }
}

function closeReport() {
  $('report-overlay').classList.remove('open');
  if (iPaused) { iPaused = false; emit('resumeGame'); }
}

$('btn-report').onclick = openReport;
$('btn-report-top').onclick = openReport;
$('btn-report-cancel').onclick = closeReport;
$('report-overlay').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeReport();
});
$('btn-report-save').onclick = () => {
  const description = $('report-text').value.trim();
  if (!description) { toast('Beskriv vad som blev fel', true); return; }
  const btn = $('btn-report-save');
  btn.disabled = true;
  socket.emit('submitReport', { description }, (res) => {
    btn.disabled = false;
    if (res?.error) { toast(res.error, true); return; }
    $('report-text').value = '';
    closeReport();
    toast('Rapporten sparades – säg till Claude att kolla rapporterna');
  });
};

/** Banderoll för alla medan spelet är pausat. */
function renderPause() {
  const banner = $('pause-banner');
  banner.hidden = !S.paused;
  if (!S.paused) return;
  banner.textContent = S.paused.playerId === me
    ? '⏸ Spelet är pausat medan du skriver din felrapport'
    : `⏸ ${nickOf(S.paused.playerId)} skriver en felrapport – spelet är pausat`;
}
$('btn-to-lobby').onclick = () => emit('returnToLobby');

function renderResult() {
  const overlay = $('result-overlay');
  if (S.phase !== 'ROUND_RESULT' || !S.result) { overlay.classList.remove('open'); return; }
  const r = S.result;
  overlay.classList.add('open');
  $('result-title').textContent = 'Rundan är slut';
  $('result-meta').textContent = `Runda ${r.round} · multiplier ×${r.multiplier}${r.miniLevel ? ` · mini-gursch nivå ${r.miniLevel}` : ''}`;

  // Resultatet ändras inte under rundan - bygg raderna en gång, inte vid varje uppdatering.
  const resultKey = `${code}:${r.round}`;
  if (renderedResultKey !== resultKey) { renderedResultKey = resultKey; buildResultRows(r); }

  const isHost = S.hostId === me;
  $('btn-play-again').disabled = !isHost;
  $('btn-to-lobby').disabled = !isHost;
  $('result-hint').textContent = isHost ? 'Dealern flyttas ett steg till nästa runda.' : `Väntar på att ${nickOf(S.hostId)} startar nästa runda.`;
}

let renderedResultKey = null;

/**
 * Varför just den spelaren förlorade och vad det kostar. Samma tal som servern räknade med
 * (money.js calculateRoundPayments): losern betalar slutvärde × multiplier till var och en av de andra.
 */
function resultExplanation(r) {
  const loser = r.players.find((p) => p.id === r.loserId);
  const name = r.loserId === me ? 'Du' : loser.nickname;
  const others = r.players.length - 1;
  const each = Math.round(r.loserValue * r.multiplier);
  const pays = `betalar ${r.loserValue} × ${r.multiplier} = ${each} kr till var och en av de ${others} andra (${each * others} kr).`;
  if (r.capReached) {
    return `Mini-gursch-gränsen nåddes vid lika slutvärde (${r.loserValue}). ${name} fick sitt kort sist i dealerordningen och ${pays}`;
  }
  const where = r.miniLevel ? ` i mini-gursch nivå ${r.miniLevel}` : '';
  return `${name} hade högst slutvärde${where} (${r.loserValue}) och ${pays}`;
}

function buildResultRows(r) {
  $('result-why').textContent = resultExplanation(r);
  const rows = $('result-rows');
  rows.innerHTML = '';
  const sorted = [...r.players].sort((a, b) => (b.finalValue ?? -1) - (a.finalValue ?? -1));
  sorted.forEach((p, i) => {
    const row = el('div', `result-row ${p.id === r.loserId ? 'loser' : ''}`);
    enter(row, { opacity: 0, transform: 'translateY(6px)' }, { delay: i * 70, duration: 250 });
    row.append(el('div', 'name', p.nickname + (p.id === r.quintExitPlayerId ? ' 🥒' : '')));
    row.append(el('div', 'val', p.finalValue === null ? '' : `slutvärde ${p.finalValue}`));
    const chg = el('div', 'chg', kr(p.change));
    chg.style.color = p.change >= 0 ? 'var(--green)' : 'var(--red)';
    row.append(chg);
    row.append(el('div', 'bal', `Saldo: ${kr(p.balance)}${p.finalCards.length ? ` · gick ut på ${p.finalCards.map((c) => RANK_LABELS[c.rank]).join(',')}` : ''}`));
    rows.append(row);
  });

  const extra = $('result-extra');
  extra.innerHTML = '';
  if (r.quintExitPlayerId) extra.append(el('div', '', `Quint/five of a kind: ${nickOf(r.quintExitPlayerId)} gick ut direkt och kunde inte bli loser.`));
  for (const s of r.slaskLog) {
    extra.append(el('div', '', `Slask: ${nickOf(s.slaskerId)} (${s.hand.join(',')}) synad av ${nickOf(s.callerId)} · ${s.faceCards} face cards · ${s.amount} kr`));
  }
  for (const m of r.miniHistory) {
    extra.append(el('div', '', `Mini-gursch nivå ${m.level}: ${m.participants.map((id) => `${nickOf(id)} ${m.values[id]}`).join(', ')} · ×${m.multiplier}`));
  }
  if (r.capReached) extra.append(el('div', '', 'Mini-gursch-gränsen nåddes - losern avgjordes av dealerordningen.'));
}

// ------------------------------------------------------------------ kortflygningar
// Utdelning och slängning visas som flygande kopior ("ghosts") ovanpå det riktiga läget.
// Spelläget är redan uppdaterat när animationen börjar - den är bara dekoration och kan
// aldrig blockera ett drag. Bara transform/opacity; varje rörelse < 300 ms, helheten får sin
// längd av en förskjutning mellan korten.

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';        // ankomster
const EASE_IN_OUT = 'cubic-bezier(0.77, 0, 0.175, 1)';    // förflyttning på skärmen
const FLIGHT_MS = 260;
const FLIP_MS = 160;

let handFx = null;   // 'deal' | 'draw' - sätts av state-hanteraren före renderingen

/** Flygningar bara när animationer är på och ingen valt minskad rörelse. */
function flightsOn() {
  return animationsOn() && !reducedMotion.matches && !document.hidden && !$('piles').hidden;
}

const rectOf = (node) => node.getBoundingClientRect();
const pileRect = (id) => rectOf($(id).querySelector('.pile-card'));

/** En rektangel med samma storlek som `size`, centrerad i `box`. */
function centeredIn(box, size) {
  return { left: box.left + (box.width - size.width) / 2, top: box.top + (box.height - size.height) / 2, width: size.width, height: size.height };
}

/** Där en motståndares kort ligger: kortraden under namnskylten, annars skylten själv. */
function seatTarget(playerId) {
  const seat = document.querySelector(`.seat[data-player-id="${playerId}"]`);
  const cards = seat?.querySelector('.seat-cards');
  return cards && cards.getBoundingClientRect().width > 0 ? cards : seat?.querySelector('.seat-badge');
}

/** Skapar ett flygande kort över `rect`. front = ett kortelement (eller null = bara baksida). */
function makeGhost(rect, front, faceUp) {
  // "small" = lekstora kort (34 px) - handkort är minst 44 px även på smala skärmar.
  const g = el('div', `ghost-card${rect.width < 40 ? ' small' : ''}`);
  Object.assign(g.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  const back = el('div', 'card back ghost-face');
  g.append(back);
  if (front) {
    front.classList.remove('selected', 'unplayable', 'locked', 'faceup-marker');
    front.classList.add('ghost-face');
    front.removeAttribute('style');
    g.append(front);
  }
  // Den dolda sidan är hopvikt (scaleX 0) tills kortet vänds.
  (faceUp && front ? back : front)?.style.setProperty('transform', 'scaleX(0)');
  $('card-fx').append(g);
  return { g, front, back };
}

/** Förflyttning (translate + skala) från `from` till `to`, i steg: [{ to, at, easing }]. */
function flightFrames(from, stops) {
  const frame = (r) => `translate(${r.left - from.left}px, ${r.top - from.top}px) scale(${r.width / from.width})`;
  return [{ transform: 'translate(0, 0) scale(1)', offset: 0, easing: stops[0].easing }]
    .concat(stops.map((s, i) => ({ transform: frame(s.to), offset: s.at, easing: stops[i + 1]?.easing ?? 'linear', ...(s.opacity !== undefined ? { opacity: s.opacity } : {}) })));
}

/**
 * Ankomst till `to` från `from`. Kopian byggs i målets storlek och startar nedskalad vid
 * `from` (FLIP) - så att innehållet (valör, hörn) alltid har rätt proportioner.
 */
function arrivalFrames(from, to, { fadeOut = false, easing = EASE_OUT } = {}) {
  const start = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})`;
  return fadeOut
    ? [{ transform: start, offset: 0, easing }, { transform: 'none', opacity: 1, offset: 0.85 }, { transform: 'none', opacity: 0, offset: 1 }]
    : [{ transform: start, easing }, { transform: 'none' }];
}

/** Vänder ett flygande kort: den synliga sidan viks ihop, den andra fälls ut. */
function flipGhost({ front, back }, toFaceUp, delay) {
  const [hide, show] = toFaceUp ? [back, front] : [front, back];
  if (!hide || !show) return;
  const half = FLIP_MS / 2;
  hide.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { delay, duration: half, easing: EASE_IN_OUT, fill: 'forwards' });
  show.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { delay: delay + half, duration: half, easing: EASE_OUT, fill: 'forwards' });
}

/** Tar bort kopian när ALLA dess animationer (flygning och vändning) är klara. */
function removeAfter(g) {
  const done = g.getAnimations({ subtree: true }).map((a) => a.finished);
  Promise.all(done).then(() => g.remove(), () => g.remove());
}

// En dold flik spelar inga animationer (tidslinjen står still). Blir fliken synlig igen
// hoppar alla kortanimationer direkt till slutet - man ska aldrig se en gammal utdelning.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  for (const a of document.getAnimations()) {
    if (a.effect?.target?.closest?.('#card-fx, #hand')) a.finish();
  }
  $('seats').classList.remove('dealing');
});

/**
 * Flyger en kopia. Den är osynlig tills den lyfter (leken visar redan en baksida), och
 * syns bara medan animationen pågår. visibleBefore: synlig direkt, på sin startplats.
 */
function fly(ghost, frames, { delay = 0, duration, visibleBefore = false }) {
  if (!visibleBefore) ghost.g.style.visibility = 'hidden';
  return ghost.g.animate(frames.map((f) => ({ ...f, visibility: 'visible' })),
    { delay, duration, fill: visibleBefore ? 'both' : 'forwards' });
}

/** Det riktiga kortet i handen döljs tills dess kopia har landat, och fälls sedan ut. */
function revealAt(node, at, { flip = true } = {}) {
  const total = at + (flip ? FLIP_MS / 2 : 1);
  node.animate([
    { opacity: 0, transform: flip ? 'scaleX(0)' : 'none', offset: 0 },
    { opacity: 0, transform: flip ? 'scaleX(0)' : 'none', offset: at / total },
    { opacity: 1, transform: 'none', offset: 1 },
  ], { duration: total, easing: EASE_OUT });
}

/**
 * Min slängning: de slängda korten samlas, vänds och flyger till slänghögen. Sedan kommer
 * nya kort från leken och vänds upp i handen. Behållna kort glider till sina nya platser.
 */
function animateMyDraw(removed, arrived, moved) {
  const pile = pileRect('pile-discard');
  const deck = pileRect('pile-deck');
  if (removed.length) {
    const cx = removed.reduce((sum, r) => sum + r.rect.left, 0) / removed.length;
    const top = Math.min(...removed.map((r) => r.rect.top)) - 14;
    removed.forEach(({ rect, clone }, i) => {
      const ghost = makeGhost(rect, clone, true);
      const gather = { left: cx + i * 5, top: top - i * 2, width: rect.width, height: rect.height };
      const target = centeredIn(pile, { width: pile.width, height: pile.width * (rect.height / rect.width) });
      const delay = i * 30;
      // samla (0-180 ms) · vänd (180-340 ms) · flyg till högen (340-620 ms) · tona ut
      fly(ghost, flightFrames(rect, [
        { to: gather, at: 0.29, easing: EASE_IN_OUT },
        { to: gather, at: 0.55, easing: EASE_IN_OUT },
        { to: target, at: 0.92, easing: EASE_IN_OUT, opacity: 1 },
        { to: target, at: 1, opacity: 0 },
      ]), { delay, duration: 620, visibleBefore: true });
      flipGhost(ghost, false, delay + 180);
      removeAfter(ghost.g);
    });
  }
  // Behållna kort som flyttats när handen sorterades om glider till sin nya plats (FLIP).
  for (const { node, from } of moved) {
    const to = rectOf(node);
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    if (Math.abs(dx) + Math.abs(dy) < 1) continue;
    node.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 240, easing: EASE_IN_OUT });
  }
  const drawStart = removed.length ? 540 : 0;
  arrived.forEach((node, i) => {
    const to = rectOf(node);
    const ghost = makeGhost(to, null, false);
    const delay = drawStart + i * 60;
    fly(ghost, arrivalFrames(deck, to), { delay, duration: FLIGHT_MS });
    // Landat: kopian viks ihop och det riktiga kortet fälls ut med framsidan upp.
    ghost.back.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { delay: delay + FLIGHT_MS, duration: FLIP_MS / 2, easing: EASE_IN_OUT, fill: 'forwards' });
    revealAt(node, delay + FLIGHT_MS + FLIP_MS / 2);
    removeAfter(ghost.g);
  });
}

/** Någon annans slängning: n baksidor till slänghögen, sedan n nya från leken till platsen. */
function animateOpponentDraw(playerId, count) {
  const seat = seatTarget(playerId);
  if (!seat || !count) return;
  const deck = pileRect('pile-deck');
  const pile = pileRect('pile-discard');
  const size = { width: deck.width, height: deck.height };
  const seatSpot = centeredIn(rectOf(seat), size);
  for (let i = 0; i < count; i++) {
    const out = makeGhost(seatSpot, null, false);
    fly(out, flightFrames(seatSpot, [
      { to: centeredIn(pile, size), at: 0.9, easing: EASE_IN_OUT, opacity: 1 },
      { to: centeredIn(pile, size), at: 1, opacity: 0 },
    ]), { delay: i * 40, duration: 320 });
    removeAfter(out.g);
    const back = makeGhost(centeredIn(deck, size), null, false);
    fly(back, flightFrames(centeredIn(deck, size), [
      { to: seatSpot, at: 0.9, easing: EASE_OUT, opacity: 1 },
      { to: seatSpot, at: 1, opacity: 0 },
    ]), { delay: 540 + i * 60, duration: 300 });
    removeAfter(back.g);
  }
}

/**
 * Utdelning: korten flyger ett i taget från leken i utdelningsordning (spelaren efter dealern
 * först) - fyra dolda varv, sedan ett uppvänt. Till sist vänds den egna handen upp.
 */
function animateDeal() {
  if (!flightsOn()) return false;
  const deck = pileRect('pile-deck');
  const size = { width: deck.width, height: deck.height };
  const start = centeredIn(deck, size);
  const dealerIdx = S.players.findIndex((p) => p.id === S.dealerId);
  const order = S.players.slice(dealerIdx + 1).concat(S.players.slice(0, dealerIdx + 1));
  // Egna kort delas ut till platserna från vänster till höger: de dolda först, det uppvända
  // sist längst till höger. När handen vänts upp glider korten till sin sorterade plats.
  const hand = [...P.hand].sort(byRank);
  const slots = hand.map((c) => rectOf(handNodes.get(c.id)));
  const dealtMine = [...hand.filter((c) => !c.faceUp), ...hand.filter((c) => c.faceUp)];
  const myCards = [];   // { node, slot, delay, faceUp }
  const total = order.length * 5;
  const stagger = Math.min(80, Math.max(30, 1300 / total));
  let k = 0;
  let lastLanding = 0;
  for (let round = 0; round < 5; round++) {
    for (const p of order) {
      const delay = k++ * stagger;
      const faceUp = round === 4;
      const land = delay + FLIGHT_MS;
      lastLanding = Math.max(lastLanding, land);
      if (p.id === me) {
        const i = myCards.length;
        const card = dealtMine[i];
        if (card) myCards.push({ node: handNodes.get(card.id), slot: slots[i], delay, faceUp });
      } else {
        const seat = seatTarget(p.id);
        if (!seat) continue;
        const spot = centeredIn(rectOf(seat), size);
        const up = faceUp ? p.visibleCards[0] : null;
        const ghost = makeGhost(start, up ? cardNode(up) : null, Boolean(up));
        fly(ghost, flightFrames(start, [
          { to: spot, at: 0.85, easing: EASE_OUT, opacity: 1 },
          { to: spot, at: 1, opacity: 0 },
        ]), { delay, duration: FLIGHT_MS + 60 });
        removeAfter(ghost.g);
      }
    }
  }
  // Den egna handen: landa på platsen (vänster → höger), vänds upp kort för kort, glid sedan
  // till den sorterade platsen. En animation per kort, så att inget krockar.
  const SORT_MS = 240;
  const flipStart = lastLanding + 120;
  const downs = myCards.filter((m) => !m.faceUp);
  const sortStart = flipStart + Math.max(0, downs.length - 1) * 40 + FLIP_MS + 80;
  for (const m of myCards) {
    const to = rectOf(m.node);   // sorterad slutplats - kopian byggs där och flyttas dit
    const at = (r) => `translate(${r.left - to.left}px, ${r.top - to.top}px) scale(${r.width / to.width})`;
    const total = sortStart + SORT_MS - m.delay;
    const ghost = makeGhost(to, m.node.cloneNode(true), m.faceUp);
    fly(ghost, [
      { transform: at(start), offset: 0, easing: EASE_OUT },
      { transform: at(m.slot), offset: FLIGHT_MS / total, easing: 'linear' },
      { transform: at(m.slot), offset: (sortStart - m.delay) / total, easing: EASE_IN_OUT },
      { transform: 'none', offset: 1 },
    ], { delay: m.delay, duration: total });
    if (!m.faceUp) flipGhost(ghost, true, flipStart + downs.indexOf(m) * 40);
    revealAt(m.node, sortStart + SORT_MS, { flip: false });
    removeAfter(ghost.g);
  }
  // Motståndarnas kort på platserna tonas in när utdelningen är klar.
  $('seats').classList.add('dealing');
  setTimeout(() => $('seats').classList.remove('dealing'), lastLanding + 60);
  return true;
}

/** Leken och slänghögen mitt på bordet - synliga medan det slängs och delas ut. */
function renderPiles() {
  const show = ['INITIAL_DISCARD', 'NEGOTIATION', 'DISCARD_SELECT', 'FINAL_SLASK'].includes(S.phase) && S.piles;
  $('piles').hidden = !show;
  if (!show) return;
  $('deck-count').textContent = S.piles.draw;
  $('pile-deck').classList.toggle('empty', S.piles.draw === 0);
  $('pile-discard').classList.toggle('empty', S.piles.discard === 0);
}

// ------------------------------------------------------------------ fx

function seatRect(playerId) {
  const seat = document.querySelector(`.seat[data-player-id="${playerId}"]`);
  const fx = $('fx');
  if (!seat || !fx) return null;
  const a = seat.getBoundingClientRect(); const b = fx.getBoundingClientRect();
  return { x: a.left + a.width / 2 - b.left, y: a.top - b.top };
}

function flyMoney(playerId, amount) {
  if (!animationsOn()) return;
  const pos = seatRect(playerId);
  if (!pos) return;
  const n = el('div', 'fx-money', kr(amount));
  n.style.left = `${pos.x}px`;
  n.style.top = `${pos.y}px`;
  n.style.color = amount >= 0 ? 'var(--green)' : 'var(--red)';
  $('fx').append(n);
  setTimeout(() => n.remove(), 1600);
}

function banner(text) {
  if (!animationsOn()) { toast(text); return; }
  const n = el('div', 'fx-banner', text);
  $('fx').append(n);
  setTimeout(() => n.remove(), 2000);
}

function handleEvents(events) {
  for (const e of events) {
    switch (e.type) {
      case 'deal': beep(330, .06, 'triangle', .04); animateDeal(); break;
      case 'flop': banner(`FLOP: ${nickOf(e.playerId)} ${e.label}`); break;
      case 'draw':
        beep(420, .05, 'triangle', .035);
        if (flightsOn()) for (const d of e.players) if (d.playerId !== me) animateOpponentDraw(d.playerId, d.count);
        break;
      case 'stay':
        noteSeat(e.playerId, 'Stay');
        if (e.endsNegotiation) noteTable(`${e.playerId === me ? 'Du' : nickOf(e.playerId)} valde stay – spelet börjar`);
        break;
      case 'paused': if (e.playerId !== me) toast(`${nickOf(e.playerId)} pausade spelet för att skriva en felrapport`); break;
      case 'resumed':
        // Den som själv pausade ser i stället "Rapporten sparades" - skriv inte över den.
        if (e.auto) toast('Pausen släppte efter 3 minuter – spelet fortsätter');
        else if (e.playerId !== me) toast('Spelet fortsätter');
        break;
      case 'negotiation': if (e.number > 1) noteTable(`Förhandling ${e.number}: kom överens igen om antal kort`); break;
      case 'agreementPending': beep(620, .07, 'triangle', .04); break;
      case 'negotiationAgreed': banner(`ALLA ÖVERENS: ${e.count} KORT`); beep(740, .12, 'sine', .05); break;
      case 'negotiationFailed': banner('INGEN ENIGHET – SPELET BÖRJAR'); break;
      case 'slask': banner('SLASK!'); beep(180, .2, 'sawtooth', .05); break;
      case 'slaskResolved': {
        if (flightsOn() && e.playerId !== me) animateOpponentDraw(e.playerId, 5);
        const mineSlask = e.playerId === me;
        const slaskerObj = mineSlask ? 'dig' : nickOf(e.playerId);   // "Greta synade dig"
        const slaskerSubj = mineSlask ? 'du' : nickOf(e.playerId);   // "– du betalar"
        const caller = e.callerId === me ? 'Du' : nickOf(e.callerId);
        // Samma regel som money.js: face cards -> slaskaren betalar 10 kr/st, inga -> synaren betalar 25 kr.
        const text = !e.callerId ? `${mineSlask ? 'Du' : nickOf(e.playerId)} slaskade osynad`
          : e.faceCards > 0 ? `${caller} synade ${slaskerObj} (${e.hand.join(',')}): ${e.faceCards} face cards – ${slaskerSubj} betalar ${e.amount} kr`
            : `${caller} synade ${slaskerObj} (${e.hand.join(',')}): inga face cards – ${e.callerId === me ? 'du' : caller} betalar ${e.amount} kr`;
        noteTable(text, 9000);
        noteSeat(e.playerId, e.callerId ? 'Synad' : 'Osynad');
        announce(text);
        break;
      }
      case 'play': beep(500, .05, 'square', .025); break;
      case 'trickWon':   // syns i sticket ("· vann"), ingen toast över handen
        announce(`${e.playerId === me ? 'Du' : nickOf(e.playerId)} vann sticket`);
        beep(660, .09, 'sine', .04);
        break;
      case 'quint': banner(e.quintTwo ? 'QUINT TWO!' : 'FIVE OF A KIND!'); beep(880, .25, 'sine', .06); break;
      case 'miniGursch': banner(`MINI-GURSCH ×${e.multiplier}`); break;
      case 'money': flyMoney(e.playerId, e.amount); break;
      case 'roundResult': beep(240, .3, 'sine', .05); break;
      case 'timeout':
        noteSeat(e.playerId, 'Tiden tog slut');
        noteTable(`${e.playerId === me ? 'Din' : `${nickOf(e.playerId)}s`} tid tog slut – ${TIMEOUT_TEXT[e.action] ?? e.action}`);
        break;
      default: break;
    }
  }
}

// ------------------------------------------------------------------ state

socket.on('state', ({ code: roomCode, you, state, private: priv, events, serverTime }) => {
  const firstState = !S;
  if (serverTime) clockOffset = serverTime - Date.now();
  code = roomCode; me = you;
  const prevPhase = S?.phase;
  S = state; P = priv;
  // Läses (och emit används) av skärmbildsskriptet, som inte ska bero på knapptexter.
  window.__gursch = { S, P, me, emit };
  store.room = roomCode;

  document.body.classList.toggle('no-anim', !S.settings.animations);

  // Rensa markering när fasen eller turen ändras
  // Rensa markering när fasen byts eller när man inte längre får välja kort
  // (realtidsfaserna har ingen tur, så turen kan inte användas som signal).
  if (prevPhase !== S.phase || !P.actions.some((a) => a.type === 'discard' || a.type === 'play')) {
    selected.clear();
  }
  if (S.roundNumber !== lastRound) { selected.clear(); lastRound = S.roundNumber; }
  // Kort som inte längre finns i handen (efter dragning/slask) får inte ligga kvar markerade.
  const inHand = new Set(P.hand.map((c) => c.id));
  for (const id of selected) if (!inHand.has(id)) selected.delete(id);

  // Utdelning eller slängning i den här uppdateringen? Då animerar flygningarna korten.
  const evs = firstState ? [] : (events ?? []);
  handFx = evs.some((e) => e.type === 'deal') ? 'deal'
    : evs.some((e) => (e.type === 'draw' && e.players.some((d) => d.playerId === me && d.count > 0))
      || (e.type === 'slaskResolved' && e.playerId === me)) ? 'draw'
    : null;

  if (S.phase === 'LOBBY') {
    showScreen('screen-lobby');
    renderLobby();
  } else {
    showScreen('screen-game');
    renderSeats(); renderCenter(); renderHand(); renderActions();
    renderSlask(); renderResult(); renderChat(); renderHistory();
    renderPause();
    tickTurnTimer();
  }
  if (events?.length && !firstState) handleEvents(events);
  else if (events?.length) handleEvents(events.filter((e) => e.type === 'money'));
  lastPhase = S.phase;
});

socket.on('connect', () => {
  const urlCode = location.pathname.startsWith('/join/') ? location.pathname.split('/')[2]?.toUpperCase() : null;
  const roomCode = urlCode || store.room;
  if (roomCode && store.playerId) {
    socket.emit('joinRoom', { code: roomCode, playerId: store.playerId, token: store.token, reconnectOnly: true }, (res) => {
      if (res.error) {
        // Felet är bara intressant om spelaren faktiskt var med i just det här rummet.
        const wasInRoom = store.room === roomCode;
        store.room = null;
        showScreen('screen-home');
        if (urlCode) { $('join-code').value = urlCode; if (wasInRoom) $('home-error').textContent = res.error; }
      } else if (res.reconnected) {
        toast('Återansluten');
      }
    });
  } else if (urlCode) {
    $('join-code').value = urlCode;
    $('join-nick').value = store.nickname;
    showScreen('screen-home');
  }
});

window.addEventListener('resize', () => { if (S && S.phase !== 'LOBBY') renderSeats(); });

socket.on('disconnect', () => toast('Tappade anslutningen – försöker återansluta…', true));

// Init
$('create-nick').value = store.nickname;
$('join-nick').value = store.nickname;
const urlCode = location.pathname.startsWith('/join/') ? location.pathname.split('/')[2]?.toUpperCase() : null;
if (urlCode) $('join-code').value = urlCode;
