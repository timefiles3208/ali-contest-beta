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
  const late = { id: 'late', name: 'late', cost: 5, traits: [] };
  const cheap = { ...first, units: ['a','b','c'], carry: ['c'], aimTraits: { t: 3 }, level: 9 };
  const costly = { ...first, id: 'costly', units: ['a','b','late'], carry: ['late'], level: 9 };
  const set = [cheap, costly];
  const options = { setData: { ...context.setData, units: [...context.setData.units, late] } };
  assert.equal(predictOpponentRoutes(set, { units: ['a','b'], gold: 23 }, '', options)[0].comp.id, costly.id);
  assert.equal(predictOpponentRoutes(set, { units: ['a','b'], gold: 2 }, '', options)[0].comp.id, cheap.id);
  assert.deepEqual(predictOpponentRoutes(set, { gold: 23 }, '', options), []);
  assert.equal(predictOpponentRoutes(set, { units: ['a'], augments: [{ ...augment, grantUnits: [] }] }, '', options)[0].comp.id, costly.id);
});

test('an equipped artifact favors the carrier build that fits it over a higher-tier alternative', () => {
  const spell = { ...first, id: 'spell', rank: { tier: 'A' }, items: { a: ['DA_SpearOfShojin'] } };
  const attack = { ...first, id: 'attack', items: { a: ['DA_GuinsoosRageblade'] } };
  const options = { setData: context.setData };
  const routes = (observation, patch = '18.7') => predictOpponentRoutes([spell, attack], observation, patch, options);
  const artifact = { id: 'manazane', unit: 'a' };
  assert.equal(routes({ units: ['a', 'b'] })[0].comp.id, 'attack');
  assert.deepEqual(routes({ units: ['a', 'b'], artifacts: [artifact] }).map(row => row.comp.id), ['spell', 'attack']);
  assert.deepEqual(routes({ artifacts: [artifact] }), []);
  assert.deepEqual(routes({ artifacts: [{ id: 'manazane' }] }), []);
  assert.deepEqual(routes({ artifacts: [{ id: 'manazane', unit: 'b' }] }), []);
  const uncertain = routes({ units: ['a', 'b'], artifacts: [{ id: 'manazane' }] });
  assert.equal(uncertain[0].comp.id, 'attack');
  assert.equal(uncertain[0].evidence, uncertain[1].evidence);
  assert.equal(predictOpponentRoutes([spell, attack], { units: ['a', 'b'], artifacts: [artifact] },
    '18.7', { ...options, sourceItems: new Map() })[0].comp.id, 'attack');
  assert.equal(routes({ units: ['a', 'b'], artifacts: [artifact] }, '19.1')[0].comp.id, 'attack');
});

test('ordinary and radiant gear preserve route order and add no contest penalty', () => {
  const spell = { ...first, id: 'spell', items: { a: ['DA_SpearOfShojin'] } };
  const attack = { ...first, id: 'attack', rank: { tier: 'A' }, items: { a: ['DA_GuinsoosRageblade'] } };
  const options = {
    ...context,
    comps: [spell, attack, second],
    patch: '18.7',
    itemsData: { items: [{ id: 'DA_SpearOfShojin', name: '朔极之矛', kind: 'completed' }] },
  };
  const boards = (artifacts, augments = [], settings = options) => new Map([['1', { routes:
    predictOpponentRoutes(options.comps, { units: ['a', 'b'], artifacts, augments }, options.patch, settings),
  }]]);
  const artifact = { id: 'manazane', unit: 'a' };
  const radiant = { id: 'radiant:DA_SpearOfShojin', unit: 'a' };
  for (const records of [[artifact], [radiant], [artifact, radiant], [{ id: 'DA_SpearOfShojin', unit: 'a' }]]) {
    const opponentBoards = boards(records);
    assert.deepEqual(opponentPressure(spell, opponentBoards), { opponents: 1, discount: 12 });
    assert.deepEqual(opponentPressure(attack, opponentBoards), { opponents: 1, discount: 12 });
    assert.match(rankOpening({ ...options, opponentBoards }).find(row => row.comp.id === spell.id)
      .reasons.join(' '), /同行.*12 分/);
  }
  assert.deepEqual(opponentPressure(spell, boards([{ ...radiant, unit: '' }])), { opponents: 1, discount: 12 });
  assert.deepEqual(opponentPressure(spell, boards([radiant], [], { ...options, sourceItems: new Map() })),
    { opponents: 1, discount: 12 });
  assert.deepEqual(opponentPressure(spell, boards([], [{ id: 'DA_PortableForge' }])), { opponents: 1, discount: 12 });
});

test('opponent route confidence uses shared encounters, confirmed builds and current copy counts', () => {
  const late = { id: 'late', name: 'late', cost: 4, traits: [] };
  const reroll = { ...first, id: 'reroll', stars: { a: 3 }, items: { a: ['spell'] } };
  const level = { ...first, id: 'level', units: ['late', 'a', 'b'], carry: ['late'], items: { late: ['spell'] } };
  const comps = [reroll, level];
  const city = { effect: 'rerolls', name: '刷新次数订阅' };
  const options = { setData: { ...context.setData, units: [...roster, late] },
    itemsData: { items: [{ id: 'spell', name: '回蓝装', kind: 'completed' }] }, city };
  const predict = (profile, ctx = options) => predictOpponentRoutes(comps, profile, '18.7', ctx);
  assert.deepEqual(predict({ gold: 24 }), []);
  assert.deepEqual(predict({ artifacts: [{ id: 'spell' }] }), []);
  const weak = predict({ unitCopies: new Map([['a', 3]]), artifacts: [{ id: 'spell', unit: 'a' }] });
  assert.equal(weak[0].confidence, 'tentative');
  assert.equal(opponentPressure(reroll, new Map([[1, { routes: weak }]])).discount, 6);
  const strong = predict({ units: ['b'], unitCopies: new Map([['a', 3]]), augments: [{ grantUnits: ['a'] }] });
  assert.equal(strong[0].comp.id, 'reroll');
  assert.equal(strong[0].confidence, 'strong');
  assert.match(strong[0].reasons.join(' '), /3 张.*专属海克斯.*刷新次数订阅/);
  const board = { units: ['a', 'b'], gold: 24 };
  assert.ok(predict(board).find(row => row.comp.id === 'reroll').evidence >
    predict(board, { ...options, city: null }).find(row => row.comp.id === 'reroll').evidence);
});

test('gear and its wearer cannot establish a route without independent holds or augments', () => {
  const spell = { ...first, items: { a: ['DA_SpearOfShojin'] } };
  const result = predictOpponentRoutes([spell], { artifacts: [{ id: 'manazane', unit: 'a' }] }, '18.7',
    { setData: context.setData });
  assert.deepEqual(result, []);

  const spellVariant = { ...spell, id: 'variant', rank: { tier: 'S+' } };
  const supported = { units: ['a', 'b'] };
  const predict = artifacts => predictOpponentRoutes([spell, spellVariant], { ...supported, artifacts }, '18.7',
    { setData: context.setData });
  assert.deepEqual(predict([{ id: 'manazane', unit: 'a' }]), predict([]));

  const tank = { ...spell, tank: ['a'], items: { a: ['DA_BrambleVest'] } };
  const tankRoutes = artifacts => predictOpponentRoutes([tank], { ...supported, artifacts }, '18.7',
    { setData: context.setData });
  assert.deepEqual(tankRoutes([{ id: 'crest', unit: 'a' }]), tankRoutes([]));
});
