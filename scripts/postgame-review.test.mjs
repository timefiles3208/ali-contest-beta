import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { postgameReview } from '../src/engine/postgame-review.js';

const catalog = JSON.parse(readFileSync(new URL('../src/data/dataj/s18.18.7.catalog.json', import.meta.url)));
const units = ['洛', '阿狸'].map(name => catalog.units.find(unit => unit.name === name));
const context = {
  setData: { ...catalog, scope: { sourceId: 'dataj', game: '金铲铲之战', season: 18, version: '18.7' } },
  items: catalog,
  comps: [{ name: '阵容样例', units: units.map(unit => unit.id) }],
};

test('uses the visible personal settlement fields and selected Gold Spatula catalog', () => {
  const review = postgameReview('金铲铲之战　对局结算\n第 ３ 名\n我的阵容\n洛 阿狸\n我的妆备：珠光护手', context);
  assert.equal(review.rank, 3);
  assert.deepEqual(new Set(review.units.map(unit => unit.name)), new Set(['洛', '阿狸']));
  assert.deepEqual(review.equipment.map(item => item.name), ['珠光护手']);
  assert.deepEqual(review.comparisons, [{ name: '阵容样例', count: 2 }]);
});

test('refuses live gameplay and ambiguous multi-player or multi-match summaries', () => {
  for (const text of ['2-1\n备战席\n阿狸 洛\n第3名', '对局结算\n我的阵容 洛 阿狸', '战绩详情\n第2名\n第5名']) {
    assert.match(postgameReview(text, context).error, /未能确认/);
  }
});

test('leaves unseen details blank and rejects explicitly different game and patch', () => {
  assert.deepEqual(postgameReview('战绩详情\n最终排名：五\n阿狸 洛', context), { rank: 5, units: [], equipment: [], comparisons: [] });
  assert.match(postgameReview('云顶之弈\n对局结算\n第3名', context).error, /云顶之弈/);
  assert.match(postgameReview('金铲铲之战 版本18.6\n对局结算\n第3名', context).error, /版本/);
});
