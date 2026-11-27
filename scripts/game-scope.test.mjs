import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { adaptBoard } from '../src/adapters/board-sources.js';
import { findSet } from '../src/data/sets.js';
import { rankOpening } from '../src/engine/opening.js';
import { screenScopeMismatch } from '../src/engine/game-scope.js';
import { findModel, modelKey } from '../src/ui/model-library.js';

const tft = { sourceId: 'datatft', game: '云顶之弈', season: 18, version: '18.7' };
const dataj = { ...tft, sourceId: 'dataj', game: '金铲铲之战' };
const file = path => JSON.parse(readFileSync(new URL(`../src/data/${path}`, import.meta.url)));

test('version lookup and screen identity require explicit compatible evidence', () => {
  assert.equal(findSet('18.7').set, 18);
  assert.equal(findSet('18.6'), undefined);
  assert.equal(screenScopeMismatch('Teamfight Tactics\nPatch 18.7\n2-1', tft), null);
  assert.equal(screenScopeMismatch('云顶之弈\n版本 16.23.1', tft), null);
  assert.equal(screenScopeMismatch('2-1\n阿狸', dataj), null);
  assert.match(screenScopeMismatch('金 铲 铲 之 战\n版本 18.7', tft), /当前选择为「云顶之弈」/);
  assert.match(screenScopeMismatch('版本 18.6', dataj), /画面版本/);
  assert.match(screenScopeMismatch('云顶之弈\nPatch 19.1', tft), /画面版本/);
});

test('a scoped DataJ lineup uses its own exact hero, gear and trait IDs', () => {
  const items = file('dataj/s18.18.7.catalog.json');
  const setData = { ...items, set: 18, scope: dataj };
  const raw = file('dataj/s18.18.7.json');
  const { comps } = adaptBoard(raw, { source: 'dataj', setData, items });
  const ahri = comps.find(comp => comp.name === '神谕狐狸');
  assert.ok(ahri.carry.includes('jcc-unit:4511'));
  assert.ok(ahri.units.includes('jcc-unit:3513'));
  assert.ok(!ahri.units.includes('jcc-unit:3512'));
  assert.ok(ahri.aimTraits['jcc-trait:350'] >= 4);
  assert.ok(Object.values(ahri.items).flat().includes('jcc-item:2038'));
  assert.throws(() => adaptBoard(raw, { source: 'dataj', setData: { ...setData, scope: tft }, items }), /所选游戏版本/);
  assert.throws(() => adaptBoard({ ...raw, version: '18.6' }, { source: 'dataj', setData, items }), /所选游戏版本/);
  const input = { setData, comps, itemsData: items, patch: '18.7', sourceId: 'dataj', level: 7,
    selected: new Set(['jcc-unit:3513', 'jcc-unit:1511']), owned: new Map(), ownedItems: new Set(['jcc-item:2038']) };
  assert.ok(rankOpening(input).length);
  assert.deepEqual(rankOpening({ ...input, sourceId: 'datatft' }), []);
  assert.deepEqual(rankOpening({ ...input, patch: '18.6' }), []);
});

test('saved models are looked up only in the selected game and version', async () => {
  const files = new Map([[modelKey('datatft', 18, 'ahri', '18.7'), 'legacy TFT']]);
  const read = key => files.get(key);
  assert.equal((await findModel('datatft', 18, 'ahri', '18.7', read)).file, 'legacy TFT');
  assert.equal(await findModel('dataj', 18, 'ahri', '18.7', read), null);
  assert.equal(await findModel('datatft', 18, 'ahri', '18.6', read), null);
});
