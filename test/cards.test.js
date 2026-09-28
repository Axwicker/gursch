import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDeck, shuffleDeck, drawCards, countFaceCards } from '../src/engine/cards.js';
import { seededRng } from './helpers.js';

test('[R1] kortleken har exakt 52 unika kort', () => {
  const deck = createDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map((c) => c.id)).size, 52);
  for (const rank of [2, 7, 13, 14]) {
    assert.equal(deck.filter((c) => c.rank === rank).length, 4);
  }
  assert.equal(deck.filter((c) => c.rank === 15).length, 0, 'inga jokrar');
});

test('[R1] shuffle behåller exakt samma kort', () => {
  const deck = createDeck();
  const shuffled = shuffleDeck(deck, seededRng(7));
  assert.equal(shuffled.length, 52);
  assert.deepEqual(
    shuffled.map((c) => c.id).sort(),
    deck.map((c) => c.id).sort(),
  );
  assert.notDeepEqual(shuffled.map((c) => c.id), deck.map((c) => c.id));
});

test('[R12] draw pile återanvänder discard pile när den tar slut', () => {
  const deck = createDeck();
  const piles = { draw: deck.slice(0, 2), discard: deck.slice(2, 10) };
  const drawn = drawCards(piles, 5, seededRng(3));
  assert.equal(drawn.length, 5);
  assert.equal(new Set(drawn.map((c) => c.id)).size, 5);
});

test('[R3] face cards räknas korrekt', () => {
  const deck = createDeck();
  assert.equal(countFaceCards(deck.filter((c) => c.suit === 'S')), 4); // J Q K A
});
