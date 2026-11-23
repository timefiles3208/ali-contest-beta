import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCompGuide, filterCompPlans } from '../src/engine/comp-guide.js';
import { matchIconSignature } from '../src/adapters/icon-match.js';

test('planning filters require an activated trait tier and cap finished level', () => {
  const a = { comp: { id: 'a', level: 7, aimTraits: { t: 4 } } };
  const b = { comp: { id: 'b', level: 8, aimTraits: { t: 2 } } };
  const c = { comp: { id: 'c', level: 9, aimTraits: { t: 5 } } };
  assert.deepEqual(filterCompPlans([a, b, c], { trait: 't', tier: 3, maxLevel: 8 }), [a]);
  assert.deepEqual(filterCompPlans([a, b, c], {}), [a, b, c]);
});

test('the transition uses low-cost targets and computes their active traits', () => {
  const set = {
    units: Array.from({ length: 7 }, (_, i) => ({ id: String(i), cost: i < 4 ? 2 : 5, traits: ['t'] })),
    traits: [{ id: 't', name: '羁绊', tiers: [{ min: 2 }, { min: 4 }] }],
  };
  const guide = buildCompGuide({ units: set.units.map(u => u.id), carry: ['5'] }, set);
  assert.deepEqual(guide.transition.units.map(u => u.id), ['0', '1', '2', '3']);
  assert.deepEqual(guide.transition.traits.map(t => t.tier), [4]);
  assert.deepEqual(guide.rolls.map(r => r.level), [9]);
});

test('icon matching rejects unrelated and ambiguous signatures', () => {
  const icon = Uint8Array.from([12, 190, 33, 70, 10, 12]);
  const distant = Uint8Array.from([211, 14, 220, 225, 210, 208]);
  const samples = [{ id: 'a', signature: icon }, { id: 'b', signature: distant }];
  assert.deepEqual(matchIconSignature(icon, samples).map(row => row.id), ['a']);
  assert.deepEqual(matchIconSignature(icon, [...samples, { id: 'c', signature: icon }]), []);
  assert.deepEqual(matchIconSignature(new Uint8Array(6).fill(115), samples), []);
});
