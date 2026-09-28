// combination.js - kombinationslogik, 7-regeln, clean/semi-mixed, slutvärden.

import { SEVEN } from './cards.js';

export const CLEAN = 'clean';
export const SEMI = 'semi';   // semi-mixed
export const MIXED = 'mixed';

/**
 * evaluateCombination(cards) -> { type, value, size, trickValue }
 *
 *  clean : alla riktiga kort har samma värde (inga 7:or som substitut)
 *  semi  : samma värde + en eller flera 7:or som substitut (K,7 = K,K)
 *  mixed : allt annat - kan aldrig vinna ett stick
 *
 *  value      = underliggande kortvärde (det som 7:orna representerar)
 *  trickValue = värde vid stickjämförelse. Ensam 7 är lika stark som ess (14).
 */
export function evaluateCombination(cards) {
  const size = cards.length;
  if (size === 0) return { type: MIXED, value: 0, size: 0, trickValue: -1 };

  const sevens = cards.filter((c) => c.rank === SEVEN);
  const others = cards.filter((c) => c.rank !== SEVEN);

  // Enbart 7:or
  if (others.length === 0) {
    // Ensam 7 räknas som ess i stickjämförelsen, men som 7 i slutvärdet.
    const trickValue = size === 1 ? 14 : SEVEN;
    return { type: CLEAN, value: SEVEN, size, trickValue };
  }

  const rank = others[0].rank;
  const sameRank = others.every((c) => c.rank === rank);
  if (!sameRank) {
    return { type: MIXED, value: 0, size, trickValue: -1 };
  }
  const type = sevens.length === 0 ? CLEAN : SEMI;
  return { type, value: rank, size, trickValue: rank };
}

export function isClean(cards) { return evaluateCombination(cards).type === CLEAN; }
export function isSemiMixed(cards) { return evaluateCombination(cards).type === SEMI; }
export function isMixed(cards) { return evaluateCombination(cards).type === MIXED; }

/** Sorteringsnyckel för stick: [trickValue, clean>semi]. Mixed vinner aldrig. */
function trickKey(combo) {
  if (combo.type === MIXED) return [-1, -1];
  return [combo.trickValue, combo.type === CLEAN ? 1 : 0];
}

/**
 * compareCombinations(a, b) -> >0 om a är starkare, <0 om svagare, 0 om exakt lika.
 * Vid 0 gäller att den som spelade SIST vinner (hanteras i stickupplösningen).
 */
export function compareCombinations(aCards, bCards) {
  const a = trickKey(evaluateCombination(aCards));
  const b = trickKey(evaluateCombination(bCards));
  if (a[0] !== b[0]) return a[0] - b[0];
  return a[1] - b[1];
}

/** Får kombinationen leda ett stick? (måste vara clean eller semi-mixed) */
export function isValidLead(cards) {
  if (cards.length < 1 || cards.length > 5) return false;
  return evaluateCombination(cards).type !== MIXED;
}

/**
 * calculateFinalValue(cards) - slutvärde när en spelare går ut.
 *  - clean/semi: 7:an räknas som det värde den representerar  (2,2,7 = 6)
 *  - ensam 7   : 7  (ej 14)
 *  - mixed     : summan av korten, 7 räknas som 7          (3,7,5 = 15)
 */
export function calculateFinalValue(cards) {
  const combo = evaluateCombination(cards);
  if (combo.type === MIXED) {
    return cards.reduce((sum, c) => sum + c.rank, 0);
  }
  return combo.value * combo.size;
}

/** Alla icke-tomma delmängder av en hand (högst 5 kort => 31 st). */
export function subsets(cards) {
  const out = [];
  for (let mask = 1; mask < (1 << cards.length); mask++) {
    out.push(cards.filter((_, i) => mask & (1 << i)));
  }
  return out;
}

/** Det värde följande kort jämförs med: utspelets stickvärde (ensam 7 = 14). */
export function followReference(leadCards) {
  return evaluateCombination(leadCards).trickValue;
}

/**
 * Följregeln, per kort. Varje kort man lägger måste vara
 *   - en 7:a, eller
 *   - minst lika högt som utspelet, alltså det som påbörjade sticket (reference), eller
 *   - ett av spelarens lägsta kort.
 * "Lägsta" räknas bland korten man inte redan lägger som 7:a/högt kort, och en 7:a
 * räknas då som 7. Man måste alltså inte slå - bara inte lägga ett "mellankort".
 */
export function isLegalFollow(hand, cards, reference) {
  const free = (c) => c.rank === SEVEN || c.rank >= reference;
  const fillers = cards.filter((c) => !free(c)).map((c) => c.rank).sort((a, b) => a - b);
  if (fillers.length === 0) return true;
  const freeIds = new Set(cards.filter(free).map((c) => c.id));
  const lowest = hand.filter((c) => !freeIds.has(c.id)).map((c) => c.rank)
    .sort((a, b) => a - b).slice(0, fillers.length);
  return fillers.every((r, i) => r === lowest[i]);
}

/** Fem lika värden (ev. via 7-substitution), t.ex. K,K,K,K,7 */
export function isFiveOfAKind(cards) {
  if (cards.length !== 5) return false;
  return evaluateCombination(cards).type !== MIXED;
}

/** Quint two: fem kort som endast består av 2:or och 7:or. Starkaste specialhanden. */
export function isQuintTwo(cards) {
  if (cards.length !== 5) return false;
  if (!cards.every((c) => c.rank === 2 || c.rank === SEVEN)) return false;
  return cards.some((c) => c.rank === 2);
}

const COUNT_WORDS = { 2: 'två', 3: 'tre', 4: 'fyra', 5: 'fem' };
const PLURALS = { 11: 'knektar', 12: 'damer', 13: 'kungar', 14: 'ess' };

/**
 * Kort svensk beskrivning av en spelad kombination, t.ex. "tre 4:or (med 7:a)",
 * "två kungar", "ensam 7:a = ess" eller "mixed". Används i sticket och i uppspelningen.
 */
export function describeCombination(cards) {
  const combo = evaluateCombination(cards);
  if (combo.type === MIXED) return 'mixed';
  if (cards.length === 1) return combo.value === SEVEN ? 'ensam 7:a = ess' : 'ensamt kort';
  const plural = PLURALS[combo.value] ?? `${combo.value}:or`;
  const sevens = cards.filter((c) => c.rank === SEVEN).length;
  const withSevens = combo.type === SEMI ? ` (med ${sevens === 1 ? '7:a' : `${sevens} 7:or`})` : '';
  return `${COUNT_WORDS[cards.length]} ${plural}${withSevens}`;
}
