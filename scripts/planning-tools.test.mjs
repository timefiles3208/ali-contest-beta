import { readFileSync } from 'node:fs';
import { adaptBoard } from '../src/adapters/board-sources.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCompGuide, filterCompPlans } from '../src/engine/comp-guide.js';
import { matchAlignedIconSignature, matchIconSignature } from '../src/adapters/icon-match.js';

test('planning filters require an activated trait tier and cap finished level', () => {
  const a = { comp: { id: 'a', level: 7, aimTraits: { t: 4 } } };
  const b = { comp: { id: 'b', level: 8, aimTraits: { t: 2 } } };
  const c = { comp: { id: 'c', level: 9, aimTraits: { t: 5 } } };
  assert.deepEqual(filterCompPlans([a, b, c], { trait: 't', tier: 3, maxLevel: 8 }), [a]);
  assert.deepEqual(filterCompPlans([a, b, c], {}), [a, b, c]);
});

test('the transition uses low-cost targets and computes their active traits', () => {
  const set = {
    units: Array.from({ length: 7 }, (_, i) => ({ id: String(i), cost: i < 4 ? 2 : 5, traits: ['t'] })),
    traits: [{ id: 't', name: '羁绊', tiers: [{ min: 2 }, { min: 4 }] }],
  };
  const guide = buildCompGuide({ units: set.units.map(u => u.id), carry: ['5'] }, set);
  assert.deepEqual(guide.transition.units.map(u => u.id), ['0', '1', '2', '3']);
  assert.deepEqual(guide.transition.traits.map(t => t.tier), [4]);
  assert.deepEqual(guide.rolls.map(r => r.level), [9]);
});

test('icon matching rejects unrelated and ambiguous signatures', () => {
  const icon = Uint8Array.from([12, 190, 33, 70, 10, 12]);
  const distant = Uint8Array.from([211, 14, 220, 225, 210, 208]);
  const samples = [{ id: 'a', signature: icon }, { id: 'b', signature: distant }];
  assert.deepEqual(matchIconSignature(icon, samples).map(row => row.id), ['a']);
  assert.deepEqual(matchIconSignature(icon, [...samples, { id: 'c', signature: icon }]), []);
  assert.deepEqual(matchIconSignature(new Uint8Array(6).fill(115), samples), []);
});

test('aligned matching recovers an offset tile and rejects a flat crop', () => {
  const side = 12;
  const ref = Uint8Array.from({ length: side * side * 3 }, (_, i) => (i * 73 + Math.floor(i / 17) * 21) % 256);
  const shifted = new Uint8Array(ref.length);
  for (let y = 0; y < side; y++) shifted.set(ref.slice((y * side + 3) * 3, (y + 1) * side * 3), y * side * 3);
  const matches = [{ id: 'ref', signature: ref }, { id: 'other', signature: ref.map(value => 255 - value) }];
  assert.equal(matchAlignedIconSignature(shifted, matches)?.id, 'ref');
  assert.equal(matchAlignedIconSignature(new Uint8Array(ref.length).fill(30), matches), null);
});

const readData = (path) => JSON.parse(readFileSync(new URL('../src/data/' + path, import.meta.url), 'utf8'));
const set18 = readData('set18.json');
const raw = readData('datatft/s18.18.7.comps.json');
const snapshot = adaptBoard(raw, { source: 'datatft', setData: set18 });

test('18.7 transition boards match snapshot comps and contain complete, distinct rosters', () => {
  const guides = snapshot.comps.map(comp => ({ comp, guide: buildCompGuide(comp, set18, snapshot.version) }));
  const sourced = guides.filter(({ guide }) => guide.transitionStages?.length);
  assert.ok(sourced.length >= 10);
  for (const { guide } of sourced) {
    let previous = 3;
    for (const stage of guide.transitionStages) {
      assert.ok(stage.level > previous && stage.level <= 7);
      assert.equal(stage.units.length, stage.level);
      assert.equal(new Set(stage.units.map(unit => unit.id)).size, stage.level);
      assert.ok(stage.traits.every(trait => trait.tier > 0));
      assert.match(stage.source.url, /^https:\/\/tftcodex\.com\/comps\//);
      previous = stage.level;
    }
  }
  const aphelios = sourced.find(({ comp }) => comp.id === 'datatft-16315');
  assert.deepEqual(aphelios.guide.transitionStages.map(stage => stage.level), [4, 5, 7]);
  assert.ok(aphelios.guide.transitionStages[2].units.some(unit => unit.id === 'DA_18_Aphelios'));
});

test('transition boards fall back for a missing version, different game or mismatched core', () => {
  const comp = snapshot.comps.find(row => row.id === 'datatft-16315');
  assert.deepEqual(buildCompGuide(comp, set18, '18.8').transitionStages, []);
  assert.deepEqual(buildCompGuide(comp, set18).transitionStages, []);
  assert.deepEqual(buildCompGuide({ ...comp, rank: { source: 'dataj.cc' } }, set18, '18.7').transitionStages, []);
  assert.deepEqual(buildCompGuide({ ...comp, units: comp.units.filter(id => id !== 'DA_18_Aphelios') }, set18, '18.7').transitionStages, []);
});


const adaptiveSet = {
  units: [
    { id: 'tank', name: '坦克', cost: 1, traits: ['DA_18_Defender', 'family'] },
    { id: 'carry', name: '主C', cost: 4, traits: ['DA_18_Rapidfire', 'family'] },
    { id: 'holder', name: '打工棋子', cost: 1, traits: ['DA_18_Rapidfire', 'family'] },
    { id: 'guard', name: '护卫', cost: 2, traits: ['DA_18_Defender', 'family'] },
    { id: 'filler', name: '低费目标', cost: 2, traits: ['family'] },
    { id: 'other', name: '其他开局牌', cost: 1, traits: ['DA_18_Defender'] },
    { id: 'fast', name: '射手', cost: 2, traits: ['DA_18_Rapidfire'] },
    { id: 'late', name: '高费挂件', cost: 5, traits: ['family'] },
  ],
  traits: [{ id: 'family', name: '同族', tiers: [{ min: 2 }, { min: 4 }] }],
};
const adaptiveComp = {
  units: ['tank', 'carry', 'guard', 'filler', 'fast', 'late'], level: 6, carry: ['carry'],
  aimTraits: { family: 4 }, items: { carry: ['rapid','rapid2','double'] },
};
const itemsData = { items: [
  { id: 'rapid', name: '攻速装', kind: 'completed', from: ['bow','sword'] },
  { id: 'rapid2', name: '其他攻速装', kind: 'completed', from: ['bow','sword'] },
  { id: 'double', name: '双弓装', kind: 'completed', from: ['bow','bow'] },
] };
const adaptOpening = (selected, owned, ownedItems = []) => buildCompGuide(adaptiveComp, adaptiveSet, null, {
  selected: new Set(selected), owned: new Map(owned), ownedItems: new Set(ownedItems), itemsData,
}).adaptiveTransitions;

test('adaptive transitions field held substitutes, recompute traits and update after a sale', () => {
  const [stage] = adaptOpening(['holder', 'other'], []);
  assert.equal(stage.level, 4);
  assert.deepEqual([...stage.held].sort(), ['holder', 'other']);
  assert.ok(stage.units.every(unit => unit.id !== 'late'));
  assert.equal(stage.traits.find(trait => trait.id === 'family')?.tier, 2);
  const [afterSale] = adaptOpening(['other'], []);
  assert.equal(afterSale.held.includes('holder'), false);
  assert.equal(afterSale.units.some(unit => unit.id === 'holder'), false);
});

test('equipment-only transitions find a temporary compatible holder without reusing components', () => {
  const [stage] = adaptOpening([], [['bow', 1], ['sword', 1]]);
  assert.equal(stage.held.length, 0);
  assert.equal(stage.gear.length, 1);
  assert.equal(stage.gear[0].unit.id, 'fast');
  assert.equal(stage.gear[0].state, 'ready');
  const partial = adaptOpening([], [['bow', 1]])[0].gear;
  assert.equal(partial.length, 1);
  assert.deepEqual([partial[0].state, partial[0].missing], ['partial', 'sword']);
  const [separate] = adaptOpening(['holder'], [['bow', 1], ['sword', 1]], ['rapid']);
  assert.deepEqual(separate.gear.map(row => [row.item.id, row.state]), [['rapid', 'done'], ['rapid2', 'ready']]);
  assert.deepEqual(adaptOpening([], []), []);
});
