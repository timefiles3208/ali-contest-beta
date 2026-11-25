import assert from 'node:assert/strict';
import test from 'node:test';
import { matchRepeatedCardTitle, parseShopHud } from '../src/engine/screen-insights.js';
import { solveBoardConstraints } from '../src/engine/board-constraints.js';
import { rankOpeningAugments } from '../src/engine/opening.js';

test('normalizes zero gold and validates shop progress independently', () => {
  assert.deepEqual(parseShopHud('０', '3 级', '2/6'), { gold: 0, level: 3, xp: 2 });
  assert.deepEqual(parseShopHud('1 2', '110', '9/6'), {});
  assert.deepEqual(parseShopHud('30', 'Lv. 10', ''), { gold: 30, level: 10 });
});

test('recovers a dropped XP slash only when the level fixes the denominator', () => {
  assert.deepEqual(parseShopHud('0', '3', '26'), { gold: 0, level: 3, xp: 2 });
  assert.deepEqual(parseShopHud('0', '3', '29'), { gold: 0, level: 3 });
});

test('only resolves a repeated OCR glyph when the same-tier title is unique', () => {
  const rows = [{ id: 'a', name: '遥遥领先' }, { id: 'b', name: '远见领先' }];
  assert.equal(matchRepeatedCardTitle('通通领先', rows), 'a');
  assert.equal(matchRepeatedCardTitle('通过领先', rows), null);
  assert.equal(matchRepeatedCardTitle('通通领先', [...rows, { id: 'c', name: '步步领先' }]), null);
});

test('adds a valid alternate board without borrowing the original rating', () => {
  const units = [
    { id: 'a', cost: 1, traits: ['x'] }, { id: 'b', cost: 4, traits: [] },
    { id: 'c', cost: 2, traits: [] },
  ];
  const comp = { id: 'original', name: '榜单', units: ['a', 'b'], core: ['a'], level: 2, rank: { tier: 'S' } };
  const { comps, generated } = solveBoardConstraints([comp], { units }, {
    include: 'c', excludeCost: 4, trait: 'x', tier: 2, maxTier: 2, emblem: 'x', bearer: 'c',
  });
  assert.equal(comps.length, 1);
  assert.deepEqual(comps[0].units, ['a', 'c']);
  assert.equal(comps[0].rank, undefined);
  assert.equal(generated, true);
});

test('augment ranking uses sourced rating as a small prior and respects the offered tier', () => {
  const augments = [
    { id: 'TFT_Augment_A', name: '甲' },
    { id: 'TFT_Augment_B', name: '乙' },
    { id: 'TFT_Augment_C', name: '丙' },
  ];
  const rows = rankOpeningAugments({ setData: { units: [], traits: [] }, augments, offered: [augments[0].id, augments[1].id],
    augmentStats: new Map([['乙', { rating: 'S' }], ['丙', { rating: 'S' }]]) });
  assert.deepEqual(rows.map(row => row.aug.name), ['乙', '甲']);
});
