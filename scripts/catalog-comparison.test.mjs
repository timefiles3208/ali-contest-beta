import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogName, compareCatalogEntries } from '../src/engine/catalog-comparison.js';

test('pairs normalized names and retains each source’s distinct versions', () => {
  const left = [{ id: 'tft', name: '艾希', cost: 4 }, { id: 'tft-alt', name: '艾希', cost: 2 }];
  const right = [{ id: 'dataj', name: '艾希', cost: 3 }];
  assert.deepEqual(compareCatalogEntries(left, right, catalogName(' 艾希 '), 'shared'), [{ left, right }]);
  const a = { name: '暴风大剑' };
  const b = { name: '暴风之剑' };
  assert.deepEqual(compareCatalogEntries([a], [b], '', 'datatft'), [{ left: [a], right: [] }]);
  assert.deepEqual(compareCatalogEntries([a], [b], '', 'dataj'), [{ left: [], right: [b] }]);
});
