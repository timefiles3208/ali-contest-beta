import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { augmentTier, inferAugmentTier } from '../src/data/augment-tiers.js';
import { rankOpeningAugments } from '../src/engine/opening.js';
import { S18_OPENINGS } from '../src/data/opening-encounters.js';

const setData = { units: [], traits: [] };
const silver = { id: 'DA_18_CaretakersAlly', name: '游神的盟友', desc: '获得金币' };
const gold = { id: 'DA_SoloPlate', name: '单身板甲', desc: '获得护盾' };
const goldOther = { id: 'DA_Epoch', name: '新纪元', desc: '获得金币' };
const prism = { id: 'DA_PrismaticDestiny', name: '棱彩命运', desc: '获得金币' };

test('classifies all current catalog entries without using ratings or names', () => {
  const { augments } = JSON.parse(readFileSync(new URL('../src/data/set18.augments.json', import.meta.url), 'utf8'));
  assert.equal(augments.length, 402);
  assert.ok(augments.every(aug => ['silver', 'gold', 'prismatic'].includes(augmentTier(aug.id))));
  assert.equal(augmentTier(silver.id), 'silver');
  assert.equal(augmentTier(gold.id), 'gold');
  assert.equal(augmentTier('unknown'), null);
});

test('infers only a consistent tier and limits recommendations to offered cards of that tier', () => {
  assert.equal(inferAugmentTier([gold.id, goldOther.id]), 'gold');
  assert.equal(inferAugmentTier([silver.id, gold.id]), null);
  assert.equal(inferAugmentTier([gold.id, 'unknown']), null);
  const result = rankOpeningAugments({
    setData, augments: [silver, gold, goldOther, prism], ranked: [], selected: new Set(),
    offered: [silver.id, gold.id, prism.id], tier: 'gold',
  });
  assert.deepEqual(result.map(({ aug }) => aug.id), [gold.id]);
});

test('city synergy boosts actual compatible benefits and keeps the offered tier filter', () => {
  const xp = { ...goldOther, desc: '获得4经验值和2次免费刷新。' };
  const drawback = { ...gold, desc: '你无法购买经验，且不会获得经验。获得金币。' };
  const result = rankOpeningAugments({
    setData, augments: [drawback, xp, silver, prism], ranked: [], selected: new Set(),
    offered: [drawback.id, xp.id, silver.id], tier: 'gold',
    city: { name: '更便宜的等级', effect: 'level' },
  });
  assert.deepEqual(result.map(({ aug }) => aug.id), [xp.id, drawback.id]);
  assert.match(result[0].reasons.join(' '), /更便宜的等级.*经验/);
  assert.doesNotMatch(result[1].reasons.join(' '), /更便宜的等级/);
});

test('only opening color encounters declare their first-round tier', () => {
  const tier = name => S18_OPENINGS.find(city => city.name === name)?.firstAugmentTier;
  assert.equal(tier('黄金前奏'), 'gold');
  assert.equal(tier('棱彩开局'), 'prismatic');
  assert.equal(tier('彩彩彩之旅'), 'prismatic');
  assert.equal(tier('黄金终章'), undefined);
  assert.equal(tier('棱彩终局'), undefined);
});

test('economy distinguishes saving gold, using an early reroll board, and leveling', () => {
  const xp = { ...goldOther, desc: '获得4经验值。' };
  const cash = { ...gold, desc: '获得6金币。' };
  const context = {
    setData, augments: [xp, cash], ranked: [{ viable: true, comp: { level: 9, units: [], items: {} } }],
    selected: new Set(), offered: [xp.id, cash.id], tier: 'gold',
  };
  const low = rankOpeningAugments({ ...context, economy: 'low' });
  const high = rankOpeningAugments({ ...context, economy: 'high' });
  assert.equal(low[0].aug.id, cash.id);
  assert.match(low[0].reasons.join(' '), /经济紧张.*金币/);
  assert.equal(high[0].aug.id, xp.id);
  assert.match(high[0].reasons.join(' '), /经济充足.*人口/);
});

test('rewards the held core and the exact equipment gap, with no missing-item credit once crafted', () => {
  const comp = { level: 8, units: ['u'], core: ['u'], items: { u: ['finished'] } };
  const unit = { id: 'u', name: '核心棋子', cost: 3, traits: [] };
  const itemsData = { items: [{ id: 'finished', name: '目标成装', from: ['a', 'b'] }],
    components: [{ id: 'a', name: '辅散件' }, { id: 'b', name: '缺散件' }] };
  const gear = { ...gold, desc: '获得缺散件。', grantItems: ['缺散件'] };
  const copies = { ...goldOther, desc: '获得一个核心棋子。', grantUnits: ['核心棋子'] };
  const giveFinished = { ...gold, desc: '获得目标成装。', grantItems: ['目标成装'] };
  const context = {
    setData: { units: [unit], traits: [] }, itemsData,
    ranked: [{ viable: true, comp, detail: { coreMissing: [] } }],
    selected: new Set(['u']), owned: new Map([['a', 1]]), ownedItems: new Set(),
    augments: [gear, copies], offered: [gear.id, copies.id], tier: 'gold',
  };
  const result = rankOpeningAugments(context);
  assert.match(result.find(row => row.aug.id === gear.id).reasons.join(' '), /补齐.*目标成装/);
  assert.match(result.find(row => row.aug.id === copies.id).reasons.join(' '), /已有.*核心棋子/);
  const sold = rankOpeningAugments({ ...context, selected: new Set() });
  assert.doesNotMatch(sold.find(row => row.aug.id === copies.id).reasons.join(' '), /已有.*核心棋子/);
  const owned = rankOpeningAugments({
    ...context, augments: [giveFinished], ownedItems: new Set(['finished']),
  });
  assert.doesNotMatch(owned[0].reasons.join(' '), /缺.*目标成装/);
});
