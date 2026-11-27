import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { analyzePostgameLineup, importPostgameLineup, postgameReview } from '../src/engine/postgame-review.js';
import { datajTeamCodes } from '../src/data/s18.18.7.dataj-team-codes.js';
import { adaptBoard } from '../src/adapters/board-sources.js';

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
  assert.equal(analyzePostgameLineup(review.units, review.equipment, context).comparisons[0].count, 2);
});

test('refuses live gameplay and ambiguous multi-player or multi-match summaries', () => {
  for (const text of ['2-1\n备战席\n阿狸 洛\n第3名', '对局结算\n我的阵容 洛 阿狸', '战绩详情\n第2名\n第5名']) {
    assert.match(postgameReview(text, context).error, /未能确认/);
  }
});

test('leaves unseen details blank and rejects explicitly different game and patch', () => {
  assert.deepEqual(postgameReview('战绩详情\n最终排名：五\n阿狸 洛', context), { rank: 5, units: [], equipment: [] });
  assert.match(postgameReview('云顶之弈\n对局结算\n第3名', context).error, /云顶之弈/);
  assert.match(postgameReview('金铲铲之战 版本18.6\n对局结算\n第3名', context).error, /版本/);
});

test('analyzes roster traits, closest lineups and equipment references', () => {
  const [ahri, sett, xayah, yunara] = ['阿狸', '瑟提', '霞', '芸阿娜'].map(name => catalog.units.find(unit => unit.name === name));
  const gear = catalog.items.find(item => item.name === '珠光护手');
  const comp = { name: '莲华样例', rank: { tier: 'S', avg: 3.4, top4: 72, samples: 50 }, units: [ahri.id, sett.id, yunara.id],
    core: [ahri.id, yunara.id], itemBuilds: { [ahri.id]: [gear.id], [yunara.id]: [gear.id] }, stars: { [ahri.id]: 3, [sett.id]: 2 } };
  const wider = { ...comp, name: '重合相同但差异更多', units: [...comp.units, units[0].id] };
  const result = analyzePostgameLineup([ahri, sett, xayah, ahri], [gear], { ...context, comps: [wider, comp], stars: { [ahri.id]: 2 } });
  assert.equal(result.count, 3);
  assert.ok(result.near.some(trait => trait.name === '灵魂莲华' && trait.num === 2 && trait.next === 3));
  assert.ok(analyzePostgameLineup([ahri, sett, yunara], [], context).active.some(trait => trait.name === '灵魂莲华' && trait.tier === 3));
  assert.ok(result.near.some(trait => trait.name === '花仙子' && trait.num === 1 && trait.next === 2));
  const [best] = result.comparisons;
  assert.equal(best.name, comp.name);
  assert.equal(best.exact, false);
  assert.equal(best.stats.samples, 50);
  assert.deepEqual(best.starComparison, [{ name: '阿狸', actual: 2, listed: 3 }]);
  assert.equal(analyzePostgameLineup([ahri, sett, yunara], [], { ...context, comps: [comp] }).comparisons[0].exact, true);
  assert.deepEqual(best.sharedCore, ['阿狸']);
  assert.deepEqual(best.missing, ['芸阿娜']);
  assert.deepEqual(best.missingCore, ['芸阿娜']);
  assert.deepEqual(best.extra, ['霞']);
  assert.deepEqual(best.equipment, [{ name: '珠光护手', holders: ['阿狸'] }]);
  assert.equal(analyzePostgameLineup([], [gear], context), null);
  assert.deepEqual(analyzePostgameLineup([ahri], [], { ...context, comps: [comp] }).comparisons, []);
});

test('imports explicit names using only the selected Gold Spatula roster', () => {
  const review = importPostgameLineup('洛、阿狸，洛', context);
  assert.deepEqual(review.units.map(unit => unit.name), ['洛', '阿狸']);
  assert.match(importPostgameLineup('洛、陌生棋子', context).error, /陌生棋子/);
  assert.deepEqual(importPostgameLineup('洛、阿狸３星、阿狸', context).stars, { [units[1].id]: 3 });
  assert.match(importPostgameLineup('阿狸2星、阿狸3星', context).error, /不同星级/);
  assert.match(importPostgameLineup('洛', { setData: { ...context.setData, scope: { sourceId: 'datatft' } } }).error, /暂无卡池/);
});

test('matches wrapped and bare codes in the same version and rejects unknown codes', () => {
  const board = JSON.parse(readFileSync(new URL('../src/data/dataj/s18.18.7.json', import.meta.url)));
  const { comps } = adaptBoard(board, { source: 'dataj', setData: { ...context.setData, set: 18 }, items: catalog });
  const full = datajTeamCodes[84];
  const matched = comps.find(comp => comp.teamCode === full);
  assert.ok(matched);
  for (const code of [full, full.split('#').at(-1)]) {
    const result = importPostgameLineup(code, { ...context, comps });
    assert.equal(result.name, matched.name);
    assert.deepEqual(result.units.map(unit => unit.id), matched.units);
  }
  assert.match(importPostgameLineup(full, context).error, /无法在所选版本解析/);
});
