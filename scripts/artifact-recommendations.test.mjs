import assert from 'node:assert/strict';
import test from 'node:test';
import { recommendArtifacts } from '../src/engine/artifacts.js';

test('Ornn gets a shield synergy while an ordinary tank gets defensive alternatives', () => {
  const ornn = recommendArtifacts({ id: 'DA_18_Ornn', tank: true }, '18.7');
  assert.equal(ornn[0].name, '禁忌雕像');
  assert.ok(ornn.every(item => item.icon.endsWith('.png') && item.reason));
  assert.ok(recommendArtifacts({ id: 'DA_18_Leona', tank: true }, '18.7')
    .every(item => item.name !== '禁忌雕像'));
});

test('spell and attack builds get different options and unsupported versions or sources return none', () => {
  const mage = { carry: true, items: ['DA_SpearOfShojin', 'DA_JeweledGauntlet'] };
  const marksman = { carry: true, items: ['DA_GuinsoosRageblade', 'DA_InfinityEdge'] };
  assert.equal(recommendArtifacts(mage, '18.7')[0].name, '魔蕴');
  assert.equal(recommendArtifacts(marksman, '18.7')[0].name, '烁刃');
  assert.deepEqual(recommendArtifacts(mage, '19.1'), []);
  assert.deepEqual(recommendArtifacts(mage, '18.7', new Map()).map(item => item.name), []);
  assert.deepEqual(recommendArtifacts(mage, '18.7', new Map([['魔蕴', {}]])).map(item => item.name), ['魔蕴']);
});
