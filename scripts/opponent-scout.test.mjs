import assert from 'node:assert/strict';
import test from 'node:test';
import { predictOpponentRoutes } from '../src/engine/opponent-scout.js';
import { rankOpening } from '../src/engine/opening.js';

const roster = ['a','b','c','d','e'].map(id => ({ id, name: id, cost: 2, traits: [] }));
const comp = (id, units, tier) => ({ id, name: id, units, core: units.slice(0, 1), carry: units.slice(0, 1), level: 7, rank: { tier }, aimTraits: {} });
const first = comp('first', ['a','b'], 'S');
const second = comp('second', ['c','d'], 'A');
const context = {
  setData: { units: roster, traits: [] }, comps: [first, second],
  selected: new Set(['a','c']), owned: new Map(), ownedItems: new Set(),
};

test('two confirmed units identify an opponent route and move an uncontested comparable route first', () => {
  const opponents = new Map([['1', new Set(['a','b'])]]);
  assert.equal(predictOpponentRoutes([first, second], opponents)[0].comp?.id, first.id);
  assert.equal(rankOpening(context)[0].comp.id, first.id);
  const [top, contested] = rankOpening({ ...context, opponents });
  assert.equal(top.comp.id, second.id);
  assert.equal(contested.opponentCount, 1);
  assert.equal(contested.score, 0);
});

test('a single common unit, ambiguous rosters, and empty opponent slots cause no penalty', () => {
  const companions = comp('ambiguous', ['a','b','e'], 'B');
  assert.equal(predictOpponentRoutes([first, companions], new Map([['1', ['a','b']]]))[0].comp, null);
  assert.equal(predictOpponentRoutes([first, second], new Map([['1', ['a','a']]]))[0].comp, null);
  assert.deepEqual(predictOpponentRoutes([first, second], new Map([['1', []]])), []);
  assert.equal(rankOpening({ ...context, opponents: new Map([['1', ['a']]]) })[0].comp.id, first.id);
});

test('opponents contest variants with the same carry and the deduction is capped', () => {
  const variant = comp('variant', ['a','d','e'], 'A');
  const opponents = new Map([['1', ['a','b']], ['2', ['a','b']], ['3', ['a','b']]]);
  const ranked = rankOpening({ ...context, comps: [first, second, variant], opponents });
  assert.equal(ranked.find(row => row.comp.id === variant.id).opponentCount, 3);
  assert.equal(ranked.find(row => row.comp.id === first.id).opponentCount, 3);
  assert.equal(ranked.find(row => row.comp.id === second.id).opponentCount, 0);
  assert.ok(ranked.find(row => row.comp.id === variant.id).reasons.includes('可能有 3 名同行，适配扣 28 分'));
});
