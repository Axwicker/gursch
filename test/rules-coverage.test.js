// Kopplar RULES.md till testerna: varje regel (R1, R2, …, A1, …) måste ha minst ett test
// med taggen [R1] i namnet, och ingen tagg får peka på en regel som inte finns.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rules = [...readFileSync(path.join(root, 'RULES.md'), 'utf8').matchAll(/^\*\*([RA]\d+)\.\*\*/gm)].map((m) => m[1]);
const testSource = readdirSync(path.join(root, 'test'))
  .filter((f) => f.endsWith('.test.js') && f !== 'rules-coverage.test.js')
  .map((f) => readFileSync(path.join(root, 'test', f), 'utf8'))
  .join('\n');
const tagged = new Set([...testSource.matchAll(/\[([RA]\d+)\]/g)].map((m) => m[1]));

test('RULES.md innehåller numrerade regler i ordning', () => {
  assert.ok(rules.length > 30, `hittade bara ${rules.length} regler`);
  for (const prefix of ['R', 'A']) {
    const nums = rules.filter((r) => r.startsWith(prefix)).map((r) => Number(r.slice(1)));
    assert.deepEqual(nums, nums.map((_, i) => i + 1), `${prefix}-reglerna ska vara numrerade 1, 2, 3 …`);
  }
});

test('varje regel i RULES.md har minst ett test', () => {
  const missing = rules.filter((r) => !tagged.has(r));
  assert.deepEqual(missing, [], `regler utan test: ${missing.join(', ')}`);
});

test('inga tester pekar på regler som inte finns', () => {
  const unknown = [...tagged].filter((t) => !rules.includes(t));
  assert.deepEqual(unknown, [], `okända regeltaggar: ${unknown.join(', ')}`);
});
