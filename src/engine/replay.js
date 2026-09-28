// replay.js - spelar upp en loggad runda exakt likadant igen: samma frö ger samma
// utdelning och omblandningar, och samma drag vid samma tidpunkter ger samma förlopp.

import { GurschGame } from './game.js';

/** Plockar ut rundloggen ur en felrapport (eller tar loggen som den är). */
export function logFromReport(report) {
  const log = report?.format === 'gursch-report' ? report.log : report;
  if (log?.format !== 'gursch-round') throw new Error('Filen är ingen Gursch-rundlogg');
  return log;
}

/** Skapar spelet i rundans startläge (före första draget). */
export function startReplay(log) {
  const clock = { t: log.startedAt };
  const game = new GurschGame({ id: 'REPLAY', settings: log.settings, now: () => clock.t });
  for (const p of log.players) {
    game.addPlayer({ id: p.id, nickname: p.nickname, isBot: p.isBot, botLevel: p.botLevel });
    game.player(p.id).balance = p.balance;
  }
  game.dealerIndex = log.dealerIndex;
  game.roundNumber = log.roundNumber - 1;
  game.startRound({ seed: log.seed });
  return { game, clock };
}

/** Tillämpar en loggad händelse. Kastar om den inte längre är tillåten. */
export function applyEvent(game, clock, event) {
  clock.t = event.t;
  if (event.tick) {
    if (!game.tick()) throw new Error('Timern gjorde inget vid uppspelning');
  } else if (event.expireSlask) {
    if (!game.expireSlask()) throw new Error('Inget slaskfönster att stänga vid uppspelning');
  } else if (event.pause) {
    game.pause(event.playerId);
  } else if (event.resume) {
    game.resume(event.playerId, { force: true });
  } else {
    game.handleAction(event.playerId, event.action);
  }
}

/**
 * Spelar upp hela rundan (eller fram till händelse nr `until`, som då inte tillämpas).
 * onEvent(event, index, game) anropas efter varje tillämpad händelse.
 */
export function replayRound(log, { until = log.events.length, onEvent } = {}) {
  const { game, clock } = startReplay(log);
  log.events.slice(0, until).forEach((event, i) => {
    applyEvent(game, clock, event);
    onEvent?.(event, i, game);
  });
  return { game, clock };
}
