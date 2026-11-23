import assert from 'node:assert/strict';
import test from 'node:test';
import { matchRegionLabel } from '../src/engine/screen-insights.js';

const labels = [
  { id: 'bag', name: '英勇福袋' }, { id: 'bagPlus', name: '英勇福袋+' },
  { id: 'era', name: '新纪元' }, { id: 'camille', name: '卡蜜尔' },
];

test('normalizes segmented title text and keeps plus variants separate', () => {
  assert.equal(matchRegionLabel('英 勇 福 袋＋', labels), 'bagPlus');
  assert.equal(matchRegionLabel('新 纪 元', labels), 'era');
});

test('corrects one glyph only when the exact-length candidate is unique', () => {
  assert.equal(matchRegionLabel('英勇 福安', labels), 'bag');
  assert.equal(matchRegionLabel('卡 齐 尔', labels), 'camille');
  assert.equal(matchRegionLabel('英勇 福安', [...labels, { id: 'other', name: '英勇福气' }]), null);
  assert.equal(matchRegionLabel('识别 英勇福袋 的属性', labels), null);
  assert.equal(matchRegionLabel('英勇', labels), null);
});
