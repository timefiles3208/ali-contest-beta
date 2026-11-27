import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { adaptBoard } from '../src/adapters/board-sources.js';
import { buildCompGuide } from '../src/engine/comp-guide.js';

const setData = { set: 18, units: [
  { id: 'carry', name: '主输出', cost: 3, traits: [] },
  { id: 'tank', name: '前排', cost: 4, traits: ['DA_18_Vanguard'] },
  { id: 'support', name: '辅助', cost: 2, traits: [] },
] };

test('retains source stars and separates reroll at 7 from an eight-unit finish', () => {
  const raw = { source: 'datatft.com', season: 18, version: '18.7', comps: [{
    id: 'x', title: '追三测试', heroId: '1', heros: [
      { id: '1', key: 'carry', stars: 3 }, { key: 'tank' }, { key: 'support', stars: 0 },
    ],
  }] };
  const [comp] = adaptBoard(raw, { source: 'datatft', setData }).comps;
  const guide = buildCompGuide({ ...comp, level: 8 }, setData);
  assert.deepEqual(guide.units.map(({ id, stars, sourceStars }) => [id, stars, sourceStars]),
    [['carry', 3, true], ['tank', 2, false], ['support', 2, false]]);
  assert.deepEqual(guide.rolls.map(({ level, targets }) => [level, targets.map(unit => unit.id)]),
    [[7, ['carry']]]);
  assert.equal(guide.board.length, 4);
  assert.ok(guide.board.every(row => row.length === 7));
  assert.equal(guide.board[0].find(Boolean).id, 'tank');
  assert.equal(guide.board[3].find(Boolean).id, 'carry');
  assert.equal(guide.board.flat().filter(Boolean).length, 3);
});

test('both release snapshots produce complete, nonoverlapping boards and valid equipment guides', () => {
  const read = path => JSON.parse(readFileSync(new URL(`../src/data/${path}`, import.meta.url), 'utf8'));
  const setData = read('set18.json');
  const items = read('set18.items.json');
  for (const [source, path, count] of [
    ['datatft', 'datatft/s18.18.7.comps.json', 36],
    ['dataj', 'dataj/s18.18.7.json', 26],
  ]) {
    const { comps } = adaptBoard(read(path), { source, setData, items });
    assert.equal(comps.length, count);
    if (source === 'dataj') {
      const { units } = buildCompGuide(comps.find(comp => comp.name === '野怪小红'), setData);
      assert.equal(units.find(unit => unit.name === '苍蓝哨戒').items.filter(id => id === 'DA_ArchangelsStaff').length, 2);
    }
    for (const comp of comps) {
      const { board, units, rolls } = buildCompGuide(comp, setData);
      assert.deepEqual(board.flat().filter(Boolean).map(unit => unit.id).sort(), [...comp.units].sort(), comp.name);
      assert.ok(rolls.every(roll => roll.level >= 4 && roll.level <= 9 && roll.targets.length));
      assert.ok(units.some(unit => unit.items.length), comp.name);
    }
  }
});
