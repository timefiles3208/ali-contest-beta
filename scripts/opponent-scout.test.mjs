import assert from 'node:assert/strict';
import test from 'node:test';
import { opponentPressure, predictOpponentRoutes } from '../src/engine/opponent-scout.js';
import { rankOpening } from '../src/engine/opening.js';
import { readOpponentProfile } from '../src/engine/screen-insights.js';

const roster = ['a','b','c','d','e','f'].map(id => ({ id, name: id, cost: 2, traits: [] }));
const comp = (id, units, tier, aimTraits = {}) => ({
  id, name: id, units, core: units.slice(0, 1), carry: units.slice(0, 1), level: 7, rank: { tier }, aimTraits,
});
const first = comp('first', ['a','b'], 'S', { t: 3, u: 2 });
const second = comp('second', ['c','d'], 'A');
const third = comp('third', ['f','b','e'], 'A');
const fourth = comp('fourth', ['d','a'], 'B');
const fifth = comp('fifth', ['e','a'], 'B');
const context = {
  setData: { units: roster, traits: [] }, comps: [first, second, third, fourth, fifth],
  selected: new Set(['a','c']), owned: new Map(), ownedItems: new Set(),
};
const evidence = { units: ['a','b','d','e'], traits: ['t','u'] };

test('one board returns up to three ranked routes and discounts competing alternatives', () => {
  const routes = predictOpponentRoutes(context.comps, evidence);
  assert.deepEqual(routes.map(({ comp }) => comp.id), ['first', 'fourth', 'fifth']);
  const opponentBoards = new Map([['1', { routes }]]);
  assert.equal(rankOpening(context)[0].comp.id, first.id);
  const ranked = rankOpening({ ...context, opponentBoards });
  assert.equal(ranked[0].comp.id, second.id);
  assert.match(ranked.find(row => row.comp.id === first.id).reasons.join(' '), /同行.*12 分/);
  assert.deepEqual(opponentPressure(fourth, opponentBoards), { opponents: 1, discount: 8 });
  assert.deepEqual(opponentPressure(fifth, opponentBoards), { opponents: 1, discount: 8 });
});

test('weak reads yield no guesses while two matching traits can supply useful evidence', () => {
  assert.deepEqual(predictOpponentRoutes(context.comps, { units: ['a','a'] }), []);
  assert.deepEqual(predictOpponentRoutes(context.comps, { traits: ['t'] }), []);
  assert.deepEqual(predictOpponentRoutes(context.comps, { traits: ['t','u'] }).map(row => row.comp.id), ['first']);
});

test('a new observation replaces that slot, and each opponent contributes at most once per lineup', () => {
  const variant = comp('variant', ['a','b','e'], 'B');
  const routes = predictOpponentRoutes([...context.comps, variant], evidence);
  const opponentBoards = new Map([['1', { routes }], ['2', { routes }], ['3', { routes }]]);
  assert.deepEqual(opponentPressure(first, opponentBoards), { opponents: 3, discount: 28 });
  opponentBoards.set('1', { routes: predictOpponentRoutes(context.comps, { units: ['c','d'] }) });
  assert.deepEqual(opponentPressure(first, opponentBoards), { opponents: 2, discount: 24 });
  assert.deepEqual(opponentPressure(second, opponentBoards), { opponents: 1, discount: 12 });
});


const augment = { id: 'specific', name: '森林冠冕', traits: ['u'], grantTraits: ['u'], grantUnits: ['a'] };
test('opponent HUD needs ownership labels and exact selected augment titles', () => {
  assert.deepEqual(readOpponentProfile('对手金币：24\n已选海克斯：森林冠冕\n15 金币\n森林冠冕', [augment]), { gold: 24, augmentIds: ['specific'] });
  assert.deepEqual(readOpponentProfile('24 金币\n己方金币 12\n可选海克斯：森林冠冕\n森林冠冕', [augment]), { gold: null, augmentIds: [] });
  assert.deepEqual(readOpponentProfile('对手金币 0\n对手金币 20\n已选海克斯：森林冠冕+', [augment]), { gold: null, augmentIds: [] });
});
test('economy breaks close route ties and an aligned selected augment can resolve sparse boards', () => {
  const cheap = { ...first, aimTraits: { t: 3 }, level: 6 };
  const costly = { ...first, id: 'costly', level: 9 };
  const set = [cheap, costly];
  const options = { setData: context.setData };
  assert.equal(predictOpponentRoutes(set, { units: ['a','b'], gold: 23 }, '', options)[0].comp.id, costly.id);
  assert.equal(predictOpponentRoutes(set, { units: ['a','b'], gold: 2 }, '', options)[0].comp.id, cheap.id);
  assert.deepEqual(predictOpponentRoutes(set, { gold: 23 }, '', options), []);
  assert.equal(predictOpponentRoutes(set, { units: ['a'], augments: [{ ...augment, grantUnits: [] }] }, '', options)[0].comp.id, costly.id);
});
