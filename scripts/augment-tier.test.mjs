import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { augmentTier, inferAugmentTier } from '../src/data/augment-tiers.js';
import { rankOpeningAugments } from '../src/engine/opening.js';

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
