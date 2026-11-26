import assert from 'node:assert/strict';
import test from 'node:test';
import { openingUnitDirection } from '../src/engine/opening-prompts.js';

const carry = { id: 'carry', name: '主 C', cost: 1, stars: 3 };
const expensive = { id: 'three', name: '三费主 C', cost: 3, stars: 2 };
const row = (unit, extra = {}) => ({
  comp: { id: 'route', core: [unit.id, 'partner'] },
  formation: { carries: [unit], tanks: [], chase: unit.stars === 3 ? [unit] : [] },
  viable: true, gearPoints: 0, ...extra,
});
const pick = (ranked, selected, unitCopies = new Map(), prompted = new Set()) =>
  openingUnitDirection({ ranked, selected: new Set(selected), unitCopies }, prompted);

test('strong opening hints need a confirmed core unit and an appropriate supporting signal', () => {
  assert.equal(pick([row(carry)], []), null);
  assert.equal(pick([row(carry)], ['carry']), null);
  assert.deepEqual(pick([row(carry)], ['carry'], new Map([['carry', 3]])), { row: row(carry), unit: carry });
  assert.equal(pick([row(carry, { gearPoints: 5 })], ['carry']).unit, carry);
  assert.equal(pick([row(carry)], ['carry', 'partner']).unit, carry);
  assert.equal(pick([row(expensive)], ['three']).unit, expensive);
  assert.equal(pick([row(expensive)], ['three'], new Map(), new Set(['three'])), null);
  assert.equal(pick([row(expensive, { planning: true })], ['three']), null);
});
