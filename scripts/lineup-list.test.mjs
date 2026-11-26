import assert from 'node:assert/strict';
import test from 'node:test';
import { rankOpening } from '../src/engine/opening.js';
import { recommendedLineups } from '../src/ui/lineup-list.js';

test('short lists preserve fit, rating, and placement order and only adds unmatched backups when needed', () => {
  const units = ['a', 'b', 'c', 'd'].map(id => ({ id, name: id, cost: 1, traits: [] }));
  const comp = (id, roster, tier, top4) => ({
    id, name: id, level: 7, units: roster, core: roster, rank: { tier, top4 }, aimTraits: {},
  });
  const comps = [
    comp('unmatched', ['d'], 'S+', 77),
    comp('rating', ['a'], 'S', 60),
    comp('second', ['a'], 'A', 62),
    comp('better-fit', ['a', 'b'], 'B', 48),
    comp('fourth', ['a'], 'A', 55),
  ];
  const ranked = rankOpening({
    setData: { units, traits: [] }, comps, selected: new Set(['a', 'b']),
    owned: new Map(), ownedItems: new Set(),
  });
  assert.deepEqual(recommendedLineups(ranked).map(row => row.comp.id), ['better-fit', 'rating', 'second']);
  assert.deepEqual(recommendedLineups(ranked.filter(row => row.comp.id === 'unmatched')), []);
  assert.deepEqual(recommendedLineups(ranked.filter(row => row.comp.id === 'unmatched'), { allowUnmatched: true })
    .map(row => [row.comp.id, row.viable]), [['unmatched', false]]);
  assert.deepEqual(recommendedLineups(ranked.filter(row => ['rating', 'unmatched'].includes(row.comp.id)))
    .map(row => [row.comp.id, row.viable]), [['rating', true], ['unmatched', false]]);
});
