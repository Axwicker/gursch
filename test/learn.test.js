// "Lär dig Gursch" (public/learn.js): guiden får inte lära ut något som motorn inte håller med om.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { LEARN_SLIDES, parseCard } from '../public/learn.js';
import {
  evaluateCombination, calculateFinalValue, compareCombinations, followReference, isLegalFollow, MIXED, SEMI,
} from '../src/engine/combination.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rules = new Set([...readFileSync(path.join(root, 'RULES.md'), 'utf8').matchAll(/^\*\*([RA]\d+)\.\*\*/gm)].map((m) => m[1]));
const cards = (...codes) => codes.map((c, i) => ({ id: `${c}-${i}`, ...parseCard(c) }));
const slide = (title) => LEARN_SLIDES.find((s) => s.title === title);

test('guiden hänvisar bara till regler som finns i RULES.md', () => {
  for (const s of LEARN_SLIDES) {
    assert.ok(s.rules.length, `"${s.title}" saknar regelhänvisning`);
    for (const r of s.rules) assert.ok(rules.has(r), `"${s.title}" hänvisar till ${r}, som inte finns`);
  }
});

test('guidens kort är riktiga kort', () => {
  for (const s of LEARN_SLIDES) {
    for (const row of s.rows) {
      for (const c of row.cards ?? []) {
        const { rank, suit } = parseCard(c);
        assert.ok(rank >= 2 && rank <= 14 && 'SHDC'.includes(suit), `${c} i "${s.title}"`);
      }
    }
  }
});

test('[R7] [R8] guidens exempel på 7:an och mixed', () => {
  assert.equal(evaluateCombination(cards('KS', '7H')).type, SEMI);
  assert.equal(evaluateCombination(cards('2C', '2D', '7S')).type, SEMI);
  assert.equal(evaluateCombination(cards('5H', '9C')).type, MIXED);
});

test('[R26] guidens slutvärden stämmer', () => {
  const values = { 'Gå ut lågt': [11, 26], 'Sista sticket': [6, 22, 14] };
  for (const [title, expected] of Object.entries(values)) {
    const rows = slide(title).rows;
    assert.deepEqual(rows.map((r) => calculateFinalValue(cards(...r.cards))), expected, title);
    rows.forEach((r, i) => assert.ok(r.text.includes(String(expected[i])), `"${r.text}" ska nämna ${expected[i]}`));
  }
});

test('[R24] guidens exempel på följregeln: 7,9,K,A mot Q,Q', () => {
  const hand = cards('7S', '9D', 'KC', 'AH');
  const ref = followReference(cards('QS', 'QH'));
  assert.equal(isLegalFollow(hand, [hand[0], hand[1]], ref), true);    // 7 + 9
  assert.equal(isLegalFollow(hand, [hand[2], hand[1]], ref), false);   // K + 9
});

test('[R25] guidens exempel på vem som leder sticket', () => {
  assert.ok(compareCombinations(cards('AS', '7D'), cards('8C', '8H')) < 0);   // A,7 tar inte 8,8
  assert.ok(compareCombinations(cards('KS', 'KH'), cards('KD', '7C')) > 0);   // K,K tar K,7
});
