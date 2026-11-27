import assert from 'node:assert/strict';
import test from 'node:test';
import { adaptBoard } from '../src/adapters/board-sources.js';

test('DataJ S18 keeps the board and excludes the small Krug from population', () => {
  const setData = { set: 18, units: [
    { id: 'ahri', name: '阿狸', traits: [] },
    { id: 'krug', name: '远古石甲虫', traits: [] },
  ] };
  const real = [{ name: '阿狸', core: true, carry: true }, { id: '3503', name: '远古石甲虫' }];
  const base = { source: 'dataj.cc', season: 18, version: '18.7' };
  const comps = [
    { id: '111', title: '神谕狐狸', heroes: [...real, { id: '8702', name: '小型石甲虫', summon: false }] },
    { id: 'old', title: '旧快照', heroes: [...real, { name: '小型石甲虫' }] },
    { id: 'other', title: '未知棋子', heroes: [...real, { name: '其它未知棋子' }] },
  ];
  const result = adaptBoard({ ...base, comps }, { source: 'dataj', setData });
  assert.deepEqual(result.skipped, ['未知棋子']);
  assert.deepEqual(result.comps.map(row => [row.name, row.units, row.level]), [
    ['神谕狐狸', ['ahri', 'krug'], 2], ['旧快照', ['ahri', 'krug'], 2],
  ]);
});
