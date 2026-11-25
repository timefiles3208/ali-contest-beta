import { openingModel } from '../src/data/s18.18.7.opening-model.js';
import { rankOpening } from '../src/engine/opening.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { openingModelBonus, openingModelFeatures, supportsOpeningModel } from '../src/engine/opening-model.js';

test('opening model only scores a current DataTFT route with at least two matching opener units', () => {
  const comp = {
    id: 'datatft-16233', rank: { source: 'datatft.com' },
    units: ['DA_18_Ornn', 'DA_18_Ezreal', 'DA_18_Soraka', 'DA_18_Hecarim'], core: ['DA_18_Ezreal'],
  };
  const opener = new Set(['DA_18_Ornn', 'DA_18_LeBlanc', 'DA_18_Veigar']);
  const features = openingModelFeatures(comp, opener, 0);
  assert.deepEqual(features, [1, 0.75, 0.5, 0, 0, 1]);
  assert.equal(openingModelFeatures(comp, new Set(['DA_18_Ornn']), 0), null);
  assert.equal(openingModelFeatures({ ...comp, rank: { source: 'dataj.cc' } }, opener, 0), null);
  assert.equal(openingModelBonus(features, Array(6).fill(999)), 10);
  assert.equal(openingModelBonus(null, Array(6).fill(1)), 0);
  const model = { season: 18, patch: '18.7', source: 'datatft.com', weights: Array(6).fill(1) };
  assert.equal(supportsOpeningModel(18, '18.7', model), true);
  assert.equal(supportsOpeningModel(19, '19.1', model), false);
});

test('a learned fit makes a documented opener viable and disappears when the opener is sold', () => {
  const units = ['DA_18_Ornn', 'DA_18_Ezreal', 'DA_18_Soraka', 'DA_18_Hecarim', 'DA_18_LeBlanc', 'DA_18_Veigar'];
  const comp = {
    id: 'datatft-16233', rank: { source: 'datatft.com' }, level: 9,
    units: units.slice(0, 4), core: ['DA_18_Ezreal'],
  };
  const inputs = {
    setData: { set: 18, units: units.map(id => ({ id, name: id, cost: 2 })) },
    comps: [comp], selected: new Set(units.slice(4)), owned: new Map(), ownedItems: new Set(),
    patch: '18.7', model: openingModel,
  };
  const [learned] = rankOpening(inputs);
  assert.equal(learned.viable, true);
  assert.ok(learned.reasons.includes('来牌符合已知过渡棋盘'));
  assert.ok(learned.fit > 0 && learned.fit <= 10);
  assert.equal(rankOpening({ ...inputs, patch: '18.8' })[0].fit, 0);
  assert.equal(rankOpening({ ...inputs, selected: new Set() })[0].viable, false);
});
