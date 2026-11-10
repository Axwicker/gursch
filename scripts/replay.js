#!/usr/bin/env node
// Visar en loggad/rapporterad runda drag för drag.
//   npm run replay -- rapport.json            hela rundan
//   npm run replay -- rapport.json --until 12 stanna före händelse 12 och visa alla händer

import { readFileSync } from 'node:fs';
import { RANK_LABELS } from '../src/engine/cards.js';
import { logFromReport, startReplay, applyEvent } from '../src/engine/replay.js';
import { describeCombination } from '../src/engine/combination.js';

const [file, ...rest] = process.argv.slice(2);
if (!file) {
  console.error('Användning: npm run replay -- <rapport.json> [--until N]');
  process.exit(1);
}
const untilArg = rest.indexOf('--until');
const report = JSON.parse(readFileSync(file, 'utf8'));
const log = logFromReport(report);
const until = untilArg >= 0 ? Number(rest[untilArg + 1]) : log.events.length;

const nick = (id) => log.players.find((p) => p.id === id)?.nickname ?? id;
const label = (c) => RANK_LABELS[c.rank];
const time = (t) => {
  const s = (t - log.startedAt) / 1000;
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`;
};

/** Kortet med detta id, var det än ligger (hand i rundan eller i mini-gurschen). */
function findCard(game, id) {
  const r = game.round;
  for (const ctx of [r.mini, r].filter(Boolean)) {
    for (const hand of ctx.hands.values()) {
      const card = hand.find((c) => c.id === id);
      if (card) return card;
    }
  }
  return { rank: '?' };
}

/** " (tre 4:or (med 7:a))" för kombinationer - inget för ett vanligt ensamt kort. */
function combo(cards) {
  const text = describeCombination(cards);
  return text === 'ensamt kort' ? '' : ` (${text})`;
}

/** Vad timern gjorde, utläst ur spelmotorns händelser (t.ex. ett automatiskt drag). */
function timerOutcome(events) {
  const parts = [];
  for (const e of events) {
    if (e.type === 'play') parts.push(`${nick(e.playerId)} spelar ${e.cards.map(label).join(' ')}${combo(e.cards)} (automatiskt)`);
    else if (e.type === 'stay') parts.push(`${nick(e.playerId)} STAY (automatiskt)`);
    else if (e.type === 'timeout' && e.action === 'pass') parts.push(`${nick(e.playerId)} PASS (automatiskt)`);
    else if (e.type === 'timeout' && e.action === 'discard') parts.push(`${nick(e.playerId)} fick sina högsta kort slängda`);
    else if (e.type === 'negotiationAgreed') parts.push(`alla överens: ${e.count} kort`);
    else if (e.type === 'negotiationFailed') parts.push('ingen enighet – spelet börjar');
  }
  return parts.length ? ` → ${parts.join(', ')}` : '';
}

function describe(game, event) {
  if (event.tick) return '⏱  timern';
  if (event.expireSlask) return '⏱  slaskfönstret stängs (ingen synade)';
  if (event.pause) return `⏸  ${nick(event.playerId)} pausar (skriver en felrapport)`;
  if (event.resume) return `▶  spelet fortsätter${event.auto ? ' (pausen släppte efter 3 min)' : ''}`;
  if ('connected' in event) return `${event.connected ? '🔌' : '⚡'} ${nick(event.playerId)} ${event.connected ? 'återansluter' : 'tappar anslutningen'}`;
  const { type, cardIds = [], count } = event.action;
  const cards = cardIds.map((id) => label(findCard(game, id))).join(' ');
  const who = nick(event.playerId);
  return {
    discard: `${who} slänger ${cardIds.length}: ${cards}`,
    play: `${who} spelar ${cards}${combo(cardIds.map((id) => findCard(game, id)))}`,
    propose: `${who} föreslår ${count}`,
    stay: `${who} STAY`,
    pass: `${who} PASS`,
    slask: `${who} SLASK`,
    callSlask: `${who} synar slasken`,
  }[type] ?? `${who} ${type}`;
}

function showHands(game, heading) {
  console.log(heading);
  const r = game.round;
  const ctx = r.mini ?? r;
  for (const p of log.players) {
    const hand = ctx.hands.get(p.id);
    if (!hand) continue;
    const up = (ctx.visible.get(p.id) ?? new Set());
    const cards = hand.slice().sort((a, b) => a.rank - b.rank)
      .map((c) => (up.has(c.id) ? `[${label(c)}]` : label(c))).join(' ');
    console.log(`  ${p.nickname.padEnd(12)} ${cards}`);
  }
}

if (report.description) {
  console.log(`Rapport: "${report.description}"${report.reportedBy ? ` – ${report.reportedBy}` : ''}`);
}
const { game, clock } = startReplay(log);
console.log(`Runda ${log.roundNumber} · frö ${log.seed} · multiplier ×${game.round.multiplier} · dealer ${nick(log.players[log.dealerIndex]?.id)}`);
showHands(game, 'Utdelning ([ ] = uppvänt):');
console.log(`Flop: ${nick(game.round.flopWinnerId)} (${RANK_LABELS[game.round.flopRank]})\n`);

let phase = game.phase;
console.log(`── ${phase}`);
for (let i = 0; i < Math.min(until, log.events.length); i++) {
  const event = log.events[i];
  let text = describe(game, event);
  game.drainEvents();
  try {
    applyEvent(game, clock, event);
    if (event.tick || event.expireSlask) text += timerOutcome(game.drainEvents());
  } catch (err) {
    console.log(`#${String(i).padEnd(4)} ${time(event.t)}  ${text}`);
    console.log(`\n✗ AVVISAS med dagens regler: ${err.message}`);
    process.exit(2);
  }
  console.log(`#${String(i).padEnd(4)} ${time(event.t)}  ${text}`);
  if (game.phase !== phase) {
    phase = game.phase;
    console.log(`── ${phase}`);
  }
}

if (until < log.events.length) {
  showHands(game, `\nLäget före händelse #${until}:`);
} else if (log.inProgress) {
  showHands(game, `\nLäget när felet rapporterades (${game.phase}):`);
  const trick = (game.round.mini ?? game.round).currentTrick;
  if (trick?.plays.length) {
    console.log(`Sticket just nu: ${trick.plays.map((p) => `${nick(p.playerId)} ${p.cards.map(label).join(' ')}`).join(' · ')}`);
  }
} else if (game.result) {
  const res = game.result;
  console.log(`\nResultat: ${nick(res.loserId)} förlorar (slutvärde ${res.loserValue} × ${res.multiplier}${res.miniLevel ? `, mini-gursch nivå ${res.miniLevel}` : ''})`);
  for (const p of res.players) console.log(`  ${p.nickname.padEnd(12)} slutvärde ${String(p.finalValue).padEnd(3)} ${p.change >= 0 ? '+' : ''}${p.change} kr`);
  const same = log.result && res.loserId === log.result.loserId;
  console.log(same ? '\n✓ Samma resultat som när rundan spelades.' : '\n⚠ Resultatet skiljer sig från när rundan spelades.');
}
