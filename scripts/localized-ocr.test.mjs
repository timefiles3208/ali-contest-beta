import { mergeNeuralEvidence } from '../src/adapters/paddle-ocr.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { matchRegionLabel, screenEvidence, hasMatchFrame, openingNamesInText } from '../src/engine/screen-insights.js';

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

test('uses season-specific English aliases without matching parts of other words', () => {
  const setData = { set: 18, units: [{ id: 'DA_18_Ornn', name: '奥恩' }], traits: [] };
  assert.deepEqual(screenEvidence('Ornn', setData).units, ['DA_18_Ornn']);
  assert.deepEqual(screenEvidence('Ornnish', setData).units, []);
  assert.deepEqual(screenEvidence('Ornn', { ...setData, set: 19 }).units, []);
});

test('bare guide text is a preview and a verified round or actual shop HUD enables apply', () => {
  assert.equal(hasMatchFrame(null, '六主宰婕拉'), false);
  assert.equal(hasMatchFrame(null, '购买经验值\n4\n刷新'), true);
  assert.equal(hasMatchFrame('2-1', ''), true);
});

test('opening OCR only accepts complete, unambiguous card titles', () => {
  const cities = [{ id: 'city', name: '黄金交响曲' }];
  const augments = [
    { id: 'investPlus', name: '投资+' }, { id: 'invest', name: '投资策略 I' },
    { id: 'ticket', name: 'Prismatic Ticket' }, { id: 'ticketVariant', name: 'Prismatic Ticket+' },
  ];
  assert.deepEqual(openingNamesInText('欢迎来到黄金交响曲\n投资策略 I\nPrismatic Ticket\n投资更多金币\nPrismatic Ticket grants a reroll', cities, augments),
    { cities: ['city'], offered: ['invest', 'ticket'] });
  assert.deepEqual(openingNamesInText('Prismatic Ticket+', [], augments).offered, ['ticketVariant']);
  assert.deepEqual(openingNamesInText('Prismatic Ticket', [], [...augments, { id: 'duplicate', name: 'Prismatic Ticket' }]).offered, []);
});


test('AI screenshot text adds validated candidates and keeps the original stage and occupied slots', () => {
  const board = { set: 18, units: [{ id: 'DA_18_Ornn', name: '奥恩' }], traits: [{ id: 'wood', name: '永恒之森' }] };
  const opening = { cities: [], augments: [
    { id: 'DA_PrismaticTicket', name: '棱彩门票' }, { id: 'DA_GoldenGamble', name: '黄金赌约' },
  ] };
  const line = (text, x, y, score = 0.95) => ({ text, score, poly: [[x - 15, y - 4], [x + 15, y - 4], [x + 15, y + 4], [x - 15, y + 4]] });
  const result = mergeNeuralEvidence(
    { stage: '2-1', matchFrame: true, units: [], traits: [], opening: { cities: [], offered: [], offeredSlots: ['confirmed', null, null] } },
    [line('2-6', 400, 12), line('Ornn', 500, 740), line('推荐：奥恩', 500, 130), line('永恒之森', 120, 250),
      line('黄金赌约', 287, 400), line('Prismatic Ticket', 501, 400), line('黄金赌约', 714, 400, 0.4)],
    { width: 1000, height: 800 }, board, opening,
  );
  assert.equal(result.stage, '2-1');
  assert.deepEqual(result.units, ['DA_18_Ornn']);
  assert.deepEqual(result.traits, ['wood']);
  assert.deepEqual(result.opening.offeredSlots, ['confirmed', 'DA_PrismaticTicket', null]);
});

test('a stage mentioned in a guide does not authorize applying AI results as a match', () => {
  const board = { set: 18, units: [], traits: [] };
  const result = mergeNeuralEvidence({ stage: null, matchFrame: false, units: [], traits: [] },
    [{ text: '2-1', score: 0.99, poly: [[390, 6], [413, 6], [413, 24], [390, 24]] }],
    { width: 1000, height: 800 }, board);
  assert.equal(result.stage, '2-1');
  assert.equal(result.matchFrame, false);
});
