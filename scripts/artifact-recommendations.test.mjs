import assert from 'node:assert/strict';
import test from 'node:test';
import { artifactAugmentChoices, recommendArtifacts } from '../src/engine/artifacts.js';

test('Ornn gets a shield synergy while an ordinary tank gets defensive alternatives', () => {
  const ornn = recommendArtifacts({ id: 'DA_18_Ornn', tank: true }, '18.7');
  assert.equal(ornn[0].name, '禁忌雕像');
  assert.ok(ornn.every(item => item.icon.endsWith('.png') && item.reason));
  assert.ok(recommendArtifacts({ id: 'DA_18_Leona', tank: true }, '18.7')
    .every(item => item.name !== '禁忌雕像'));
});

test('confirmed artifact augments suggest distinct item and carrier pairs for the chosen lineup', () => {
  const ornn = { id: 'DA_18_Ornn', name: '奥恩', cost: 1 };
  const caster = { id: 'caster', name: '法师', cost: 3 };
  const comp = { units: [ornn.id, caster.id], carry: [caster.id], items: {
    [ornn.id]: ['DA_GargoyleStoneplate'], [caster.id]: ['DA_SpearOfShojin'],
  } };
  const context = { comp, setData: { units: [ornn, caster] }, patch: '18.7', selected: new Set([ornn.id]) };
  const pairs = id => artifactAugmentChoices(id, context).map(({ item, unit }) => [item.name, unit.name]);
  assert.deepEqual(pairs('DA_PortableForge'), [['禁忌雕像', '奥恩'], ['魔蕴', '法师']]);
  assert.deepEqual(pairs('DA_LatentForge'), pairs('DA_PortableForge'));
  assert.deepEqual(pairs('DA_RadiantRelic'), []);
  assert.deepEqual(artifactAugmentChoices('DA_PortableForge', { ...context, patch: '18.8' }), []);
  assert.deepEqual(artifactAugmentChoices('DA_PortableForge', { ...context, sourceItems: new Map() }), []);
});

test('spell and attack builds get different options and unsupported versions or sources return none', () => {
  const mage = { carry: true, items: ['DA_SpearOfShojin', 'DA_JeweledGauntlet'] };
  const marksman = { carry: true, items: ['DA_GuinsoosRageblade', 'DA_InfinityEdge'] };
  assert.equal(recommendArtifacts(mage, '18.7')[0].name, '魔蕴');
  assert.match(recommendArtifacts(mage, '18.7').find(item => item.name === '巫妖之祸').icon,
    /\/maps\/particles\/tft\/item_icons\/ornn_items\//);
  assert.equal(recommendArtifacts(marksman, '18.7')[0].name, '烁刃');
  assert.deepEqual(recommendArtifacts(mage, '19.1'), []);
  assert.deepEqual(recommendArtifacts(mage, '18.7', new Map()).map(item => item.name), []);
  assert.deepEqual(recommendArtifacts(mage, '18.7', new Map([['魔蕴', {}]])).map(item => item.name), ['魔蕴']);
});
