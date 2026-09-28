// cards.js - kortlek, värden, shuffle, dragning. Exakt EN 52-kortslek.

export const SUITS = ['S', 'H', 'D', 'C'];
export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export const RANK_LABELS = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
  10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

export const SEVEN = 7;

/** Ett kort: { id, rank, suit }. Suit har ingen spelmässig betydelse. */
export function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: `${suit}${rank}`, rank, suit });
    }
  }
  return deck;
}

/**
 * Fröbaserad slumpgenerator (mulberry32). Varje runda får ett eget frö, så att en runda
 * kan spelas upp exakt likadant igen från fröet och listan av drag.
 */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates med injicerbar rng (för deterministiska tester). */
export function shuffleDeck(deck, rng = Math.random) {
  const cards = deck.slice();
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export function cardValue(card) {
  return card.rank;
}

export function isFaceCard(card) {
  return card.rank >= 11; // J, Q, K, A
}

export function isSeven(card) {
  return card.rank === SEVEN;
}

export function countFaceCards(cards) {
  return cards.filter(isFaceCard).length;
}

export function label(card) {
  return RANK_LABELS[card.rank];
}

export function sortCards(cards) {
  return cards.slice().sort((a, b) => a.rank - b.rank || a.suit.localeCompare(b.suit));
}

/**
 * Drar n kort från draw pile. Om högen tar slut blandas discard pile och blir
 * ny draw pile. Aktiva händer/kort i pågående stick återförs aldrig.
 * piles = { draw: [], discard: [] } muteras.
 */
export function drawCards(piles, n, rng = Math.random) {
  const drawn = [];
  for (let i = 0; i < n; i++) {
    if (piles.draw.length === 0) {
      if (piles.discard.length === 0) break;
      piles.draw = shuffleDeck(piles.discard, rng);
      piles.discard = [];
    }
    drawn.push(piles.draw.pop());
  }
  return drawn;
}
