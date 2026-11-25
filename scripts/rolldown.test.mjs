import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateRolldown } from '../src/engine/rolldown.js';
import { rankOpening } from '../src/engine/opening.js';

const one = { id: 'one', name: '低费主C', cost: 1, rollLevel: 5, stars: 3, traits: [] };
const four = { id: 'four', name: '高费主C', cost: 4, rollLevel: 8, stars: 2, traits: [] };

test('existing copies, verified contested copies and budget change the chase estimate', () => {
  const attempt = (held, contested, gold = 40) => estimateRolldown(one, { level: 5, gold, held, contested }).current;
  assert.equal(attempt(9, 0, 0).probability, 1);
  assert.equal(attempt(6, 0, 2).probability, 0);
  assert.equal(attempt(1, 0).missing, 8);
  assert.ok(attempt(6, 0).probability > attempt(1, 0).probability);
  assert.ok(attempt(6, 3).probability < attempt(6, 0).probability);
});

test('a prospective upgrade consumes budget and respects current XP', () => {
  const noXp = estimateRolldown(four, { level: 7, gold: 40, xp: 0, held: 2 });
  assert.equal(noXp.upgrade.level, 8);
  assert.equal(noXp.upgrade.levelGold, 56);
  assert.equal(noXp.upgrade.probability, 0);
  const near = estimateRolldown(four, { level: 7, gold: 40, xp: 52, held: 2 });
  assert.equal(near.upgrade.levelGold, 4);
  assert.ok(near.upgrade.probability > near.current.probability);
  assert.equal(estimateRolldown(one, { level: 8, gold: 40 }).upgrade, null);
});

test('18.7 ranking responds to roll viability and preserves unconfigured ordering', () => {
  const comps = [one, four].map(unit => ({
    id: unit.id, name: unit.name, units: [unit.id], core: [unit.id],
    carry: [unit.id], stars: { [unit.id]: unit.stars }, level: 8,
    rank: { tier: unit.id === 'four' ? 'S' : 'A' },
  }));
  const support = { id: 'support', name: '辅助', cost: 2, traits: [] };
  comps[1].units.push(support.id);
  const base = {
    setData: { set: 18, units: [one, four, support], traits: [] }, patch: '18.7', comps,
    selected: new Set(['one', 'four', support.id]), ownedItems: new Set(), owned: new Map(),
    unitCopies: new Map([['one', 8], ['four', 1]]),
  };
  assert.ok(rankOpening(base).every(row => row.roll === null));
  assert.equal(rankOpening(base)[0].comp.id, 'four');
  assert.deepEqual(rankOpening({ ...base, rollBudget: { level: 5 } }), rankOpening(base));
  assert.equal(rankOpening({ ...base, rollBudget: { level: 5, gold: 20 } })[0].comp.id, 'one');
  assert.equal(rankOpening({ ...base, patch: '18.6', rollBudget: { level: 5, gold: 20 } })[0].roll, null);
  assert.equal(rankOpening({ ...base, sourceId: 'dataj', rollBudget: { level: 5, gold: 20 } })[0].roll, null);
});
