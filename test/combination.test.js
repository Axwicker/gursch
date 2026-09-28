import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateCombination, compareCombinations, calculateFinalValue,
  isFiveOfAKind, isQuintTwo, isValidLead, CLEAN, SEMI, MIXED,
} from '../src/engine/combination.js';
import { hand } from './helpers.js';

test('[R7] 7-regeln: 2,7 räknas som två tvåor', () => {
  const combo = evaluateCombination(hand('2', '7'));
  assert.equal(combo.type, SEMI);
  assert.equal(combo.value, 2);
});

test('[R7] 7-regeln: K,7 räknas som två kungar, K,K,7 som tre kungar', () => {
  assert.deepEqual(
    [evaluateCombination(hand('K', '7')).type, evaluateCombination(hand('K', '7')).value],
    [SEMI, 13],
  );
  const three = evaluateCombination(hand('K', 'K', '7'));
  assert.equal(three.type, SEMI);
  assert.equal(three.value, 13);
  assert.equal(three.size, 3);
});

test('[R25] A,7 slår K,7 (högre semi-mixed)', () => {
  assert.ok(compareCombinations(hand('A', '7'), hand('K', '7')) > 0);
});

test('[R25] K,K slår K,7 (clean slår semi-mixed)', () => {
  assert.ok(compareCombinations(hand('K', 'K'), hand('K', '7')) > 0);
});

test('[R25] högre clean slår lägre clean', () => {
  assert.ok(compareCombinations(hand('A', 'A'), hand('K', 'K')) > 0);
  assert.ok(compareCombinations(hand('3', '3'), hand('2', '2')) > 0);
});

test('[R25] identiska kombinationer är lika (sist lagd vinner i sticket)', () => {
  assert.equal(compareCombinations(hand('K', 'K'), hand('K', 'K')), 0);
  assert.equal(compareCombinations(hand('K', '7'), hand('K', '7')), 0);
});

test('[R7] [R25] ensam 7 är lika stark som ensam A i stickjämförelse', () => {
  assert.equal(compareCombinations(hand('7'), hand('A')), 0);
  assert.ok(compareCombinations(hand('7'), hand('K')) > 0);
});

test('[R8] [R25] mixed kan aldrig vinna ett stick', () => {
  const mixed = hand('Q', 'K', '10');
  assert.equal(evaluateCombination(mixed).type, MIXED);
  assert.ok(compareCombinations(mixed, hand('2', '2')) < 0);
  assert.equal(isValidLead(mixed), false);
});

test('[R26] slutvärde: ensam 7 = 7, 2,2,7 = 6, 3,7,5 = 15', () => {
  assert.equal(calculateFinalValue(hand('7')), 7);
  assert.equal(calculateFinalValue(hand('2', '2', '7')), 6);
  assert.equal(calculateFinalValue(hand('3', '7', '5')), 15);
  assert.equal(calculateFinalValue(hand('7', '3', '3')), 9);
  assert.equal(calculateFinalValue(hand('2', 'Q', 'K')), 27);
});

test('[R27] five-of-a-kind och quint two identifieras', () => {
  assert.ok(isFiveOfAKind(hand('K', 'K', 'K', 'K', '7')));
  assert.ok(isFiveOfAKind(hand('2', '2', '2', '7', '7')));
  assert.ok(!isFiveOfAKind(hand('K', 'K', 'K', 'Q', '7')));
  assert.ok(isQuintTwo(hand('2', '2', '2', '7', '7')));
  assert.ok(isQuintTwo(hand('2', '2', '2', '2', '7')));
  assert.ok(!isQuintTwo(hand('K', 'K', 'K', 'K', '7')));
  assert.equal(evaluateCombination(hand('2', '2', '2', '7', '7')).value, 2);
});
