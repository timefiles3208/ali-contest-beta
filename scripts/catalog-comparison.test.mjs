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

test('joins verified equipment aliases only when both versioned IDs are present', () => {
  const left = [{ id: 'DA_Component_BFSword', name: '暴风大剑' }, { id: 'DA_Deathblade', name: '死亡之刃' }];
  const right = [{ id: 'jcc-item:1001', name: '暴风之剑' }, { id: 'jcc-item:2045', name: '锐利之刃' }];
  const scope = { version: '18.7', category: 'items' };
  assert.deepEqual(compareCatalogEntries(left, right, '暴风大剑', 'shared', scope), [{ left: [left[0]], right: [right[0]] }]);
  assert.deepEqual(compareCatalogEntries(left, right, '锐利之刃', 'shared', scope), [{ left: [left[1]], right: [right[1]] }]);
  assert.equal(compareCatalogEntries(left, right, '', 'shared', { ...scope, version: '19.1' }).length, 0);
});
