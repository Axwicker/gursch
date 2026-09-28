// Följregeln: varje kort man lägger när man följer ett stick måste vara en 7:a,
// minst lika högt som utspelet (det som påbörjade sticket), eller ett av ens lägsta kort.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE, GurschGame } from '../src/engine/game.js';
import { isLegalFollow, followReference, subsets } from '../src/engine/combination.js';
import { makeGame, rigRound, hand, seededRng } from './helpers.js';

const play = (g, pid, cards) => g.handleAction(pid, { type: 'play', cardIds: cards.map((c) => c.id) });
const pickRanks = (h, ...labels) => {
  const left = h.slice();
  return labels.map((l) => {
    const rank = { J: 11, Q: 12, K: 13, A: 14 }[l] ?? Number(l);
    return left.splice(left.findIndex((c) => c.rank === rank), 1)[0];
  });
};

test('[R7] [R24] ensam 7:a leder = ess: en 8:a får inte läggas, bara lägsta, ess eller 7:a', () => {
  const g = makeGame(['Axel', 'Erik']);
  const r = rigRound(g, { axel: hand('7', '5'), erik: hand('8', '3', 'K') }, 'axel');
  play(g, 'axel', pickRanks(r.hands.get('axel'), '7'));
  const erik = r.hands.get('erik');
  assert.throws(() => play(g, 'erik', pickRanks(erik, '8')), /minst A eller ett av dina lägsta/);
  assert.throws(() => play(g, 'erik', pickRanks(erik, 'K')), /lägsta/, 'K är lägre än ess');
  play(g, 'erik', pickRanks(erik, '3'));
  assert.equal(r.tricks[0].winnerId, 'axel');
});

test('[R22] [R24] mixed får inte spelas ut, men får läggas när man följer (Q,K på 10,10)', () => {
  const g = makeGame(['Axel', 'Erik']);
  const r = rigRound(g, { axel: hand('10', '10', 'K', '9'), erik: hand('Q', 'K', '3', '5') }, 'axel');
  assert.throws(() => play(g, 'axel', pickRanks(r.hands.get('axel'), 'K', '9')), /giltig kombination/);
  play(g, 'axel', pickRanks(r.hands.get('axel'), '10', '10'));
  play(g, 'erik', pickRanks(r.hands.get('erik'), 'Q', 'K'));     // mixed som följ - tillåtet
  assert.equal(r.tricks[0].winnerId, 'axel', 'mixed kan aldrig vinna sticket');
});

test('[R24] den som inte har högre kort får inte lägga sitt mellersta kort', () => {
  const h = hand('3', '6', '9');
  const ref = followReference(hand('10'));
  assert.equal(isLegalFollow(h, pickRanks(h, '6'), ref), false);
  assert.equal(isLegalFollow(h, pickRanks(h, '9'), ref), false);
  assert.equal(isLegalFollow(h, pickRanks(h, '3'), ref), true);
});

test('[R24] man måste inte slå: samma valör räcker, och lika är tillåtet', () => {
  const h = hand('10', '4', 'A');
  const ref = followReference(hand('10'));
  assert.equal(isLegalFollow(h, pickRanks(h, '10'), ref), true, 'samma');
  assert.equal(isLegalFollow(h, pickRanks(h, 'A'), ref), true, 'högre');
});

test('[R24] 7:or får alltid läggas', () => {
  const h = hand('7', '3', '9');
  assert.equal(isLegalFollow(h, pickRanks(h, '7'), followReference(hand('A'))), true);
});

test('[R24] specens exempel (avsnitt 62): alla tre följdrag är lagliga mot A,A', () => {
  const ref = followReference(hand('A', 'A'));
  const erik = hand('2', '2', '7', 'Q', 'K');
  const leo = hand('A', '3', '3', 'Q', '4');
  const oskar = hand('2', '3', 'A', '7', 'K');
  assert.equal(isLegalFollow(erik, pickRanks(erik, '2', '7'), ref), true, '7:a + lägsta');
  assert.equal(isLegalFollow(leo, pickRanks(leo, 'A', '3'), ref), true, 'samma + lägsta');
  assert.equal(isLegalFollow(oskar, pickRanks(oskar, 'A', '7'), ref), true, 'samma + 7:a');
  assert.equal(isLegalFollow(leo, pickRanks(leo, 'A', 'Q'), ref), false, 'Q är ett mellankort');
});

test('[R24] flera kort: kort som inte är 7:or eller höga måste vara de lägsta', () => {
  const ref = followReference(hand('K', 'K'));
  const h = hand('4', '4', '9', '3');
  assert.equal(isLegalFollow(h, pickRanks(h, '3', '4'), ref), true);
  assert.equal(isLegalFollow(h, pickRanks(h, '4', '4'), ref), false, '3:an är lägre');
  assert.equal(isLegalFollow(h, pickRanks(h, '3', '9'), ref), false);
});

test('[R24] 7:an räknas som 7 när det gäller lägsta kort', () => {
  const ref = followReference(hand('Q', 'Q'));
  const h = hand('7', '9', 'K', 'A');
  assert.equal(isLegalFollow(h, pickRanks(h, 'K', '9'), ref), false, 'den kvarvarande 7:an är lägre än 9:an');
  assert.equal(isLegalFollow(h, pickRanks(h, '7', '9'), ref), true, 'när 7:an läggs är 9:an lägst av resten');
  assert.equal(isLegalFollow(h, pickRanks(h, 'K', 'A'), ref), true);
});

test('[R24] jämförelsen görs mot utspelet, inte mot det som leder sticket just nu', () => {
  const g = makeGame(['Axel', 'Erik', 'Leo']);
  const r = rigRound(g, { axel: hand('5', '2'), erik: hand('K', '2'), leo: hand('6', 'Q', '3') }, 'axel');
  play(g, 'axel', pickRanks(r.hands.get('axel'), '5'));   // utspel 5
  play(g, 'erik', pickRanks(r.hands.get('erik'), 'K'));   // K leder nu, men utspelet var 5
  play(g, 'leo', pickRanks(r.hands.get('leo'), 'Q'));    // Q ≥ 5 - tillåtet trots att K leder
  assert.equal(r.tricks[0].winnerId, 'erik');
});

test('[R24] ett mellankort under utspelet är fortfarande otillåtet', () => {
  const g = makeGame(['Axel', 'Erik', 'Leo']);
  const r = rigRound(g, { axel: hand('9', '2'), erik: hand('K', '2'), leo: hand('3', '6', 'Q') }, 'axel');
  play(g, 'axel', pickRanks(r.hands.get('axel'), '9'));
  play(g, 'erik', pickRanks(r.hands.get('erik'), 'K'));
  assert.throws(() => play(g, 'leo', pickRanks(r.hands.get('leo'), '6')), /minst 9/);
});

test('[R24] [A3] servern och listan över lagliga spel är alltid överens', () => {
  /** Samma parti varje gång: frö i, Axel leder med utspel nr k. */
  const setup = (i, k) => {
    const g = new GurschGame({ id: 'T', rng: seededRng(i + 1), settings: { turnSeconds: 0 } });
    g.addPlayer({ id: 'axel', nickname: 'Axel' });
    g.addPlayer({ id: 'erik', nickname: 'Erik' });
    g.startRound();
    g.phase = PHASE.TRICK;
    g.startTrick(g.round, 'axel');
    const leads = g.legalPlays(g.round, 'axel');
    play(g, 'axel', leads[k % leads.length]);
    return g;
  };
  for (let i = 0; i < 150; i++) {
    const k = i * 7;
    const g = setup(i, k);
    const options = new Set(g.privateState('erik').actions[0].options.map((ids) => ids.slice().sort().join()));
    const erikHand = g.round.hands.get('erik');
    for (const cards of subsets(erikHand).filter((x) => x.length === g.round.currentTrick.count)) {
      const fresh = setup(i, k);
      let accepted = true;
      try { play(fresh, 'erik', cards); } catch { accepted = false; }
      assert.equal(accepted, options.has(cards.map((c) => c.id).sort().join()),
        `hand ${erikHand.map((c) => c.rank)} spel ${cards.map((c) => c.rank)}`);
    }
  }
});

test('[R24] [A1] timeout-draget följer följregeln', () => {
  const g = makeGame(['Axel', 'Erik']);
  const r = rigRound(g, { axel: hand('7', '5'), erik: hand('9', '3', 'Q') }, 'axel');
  play(g, 'axel', pickRanks(r.hands.get('axel'), '7'));
  const action = g.timeoutAction('erik');
  assert.deepEqual(action.cardIds.map((id) => r.hands.get('erik').find((c) => c.id === id).rank), [3]);
});
