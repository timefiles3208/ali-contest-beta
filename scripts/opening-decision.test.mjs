import assert from 'node:assert/strict';
import test from 'node:test';
import { openingDecision, rankOpening } from '../src/engine/opening.js';
import { opponentPressure } from '../src/engine/opponent-scout.js';

const unit = (id, cost) => ({ id, name: id, cost, traits: [] });
const roster = [unit('cheap', 2), unit('front', 2), unit('late', 4), unit('bench', 1), unit('other', 3)];
const chase = {
  id: 'chase', name: '追三', level: 8, units: ['cheap', 'front'], core: ['cheap', 'front'],
  carry: ['cheap'], tank: ['front'], stars: { cheap: 3 }, aimTraits: { trait: 4 },
  items: { cheap: ['sword'], front: ['armor'] }, rank: { tier: 'A' },
};
const high = {
  id: 'high', name: '高费', level: 8, units: ['late', 'bench'], core: ['late'], carry: ['late'],
  items: { late: ['sword'] }, rank: { tier: 'S' },
};
const spare = { ...high, id: 'spare', units: ['other'], core: ['other'], carry: ['other'] };
const base = {
  setData: { set: 18, units: roster, traits: [{ id: 'trait', name: '目标羁绊', tiers: [] }] },
  patch: '18.7', comps: [chase, high, spare], selected: new Set(), owned: new Map(), ownedItems: new Set(),
  itemsData: { items: [
    { id: 'sword', name: '主C装', from: ['part', 'part'] },
    { id: 'armor', name: '主坦装', from: ['plate', 'part'] },
  ] },
};
const route = (args, id) => rankOpening(args).find(row => row.comp.id === id);

test('copies, realistic core equipment and independent evidence govern commitment', () => {
  const input = { ...base, selected: new Set(['cheap', 'front']), unitCopies: new Map([['cheap', 3]]) };
  const partial = { ...input, owned: new Map([['part', 1]]) };
  assert.equal(openingDecision(rankOpening(partial)).status, 'lean');
  const geared = { ...input, owned: new Map([['part', 2], ['plate', 1]]) };
  const ranked = rankOpening(geared);
  assert.equal(openingDecision(ranked).status, 'commit');
  assert.equal(ranked[0].comp.id, chase.id);
  assert.match(ranked[0].reasons.join(' '), /cheap.*3 张/);
  assert.equal(ranked[0].openingReady.tank, false);
  const sold = { ...geared, selected: new Set(), city: { effect: 'items', name: '装备锻炉' } };
  assert.equal(openingDecision(rankOpening(sold)).status, 'lean');
  assert.ok(rankOpening(sold).every(row => !row.reasons.some(reason => reason.includes('已持有低费追星目标'))));
});

test('confirmed dedicated augments unlock an aligned route but generic economy keeps backups', () => {
  const input = { ...base, selected: new Set(['cheap', 'front']), unitCopies: new Map([['cheap', 3]]) };
  const generic = { id: 'econ', desc: '获得10金币' };
  const specific = { id: 'dedicated', grantTraits: ['trait'], desc: '' };
  assert.equal(openingDecision(rankOpening({ ...input, chosenAugments: [generic] })).status, 'lean');
  assert.equal(openingDecision(rankOpening({ ...input, chosenAugments: [specific] })).status, 'commit');
  assert.ok(route({ ...base, chosenAugments: [specific] }, 'chase').fit > route(base, 'chase').fit);
});

test('high economy prefers expensive cores with transition support, and real shop budget can veto commitment', () => {
  const cash = { ...base, economy: 'high', ownedItems: new Set(['sword']) };
  const withBoard = { ...cash, selected: new Set(['bench', 'front']), unitCopies: new Map([['bench', 3]]) };
  assert.ok(route(withBoard, 'high').fit > route(cash, 'high').fit);
  assert.equal(openingDecision(rankOpening(cash)).status, 'lean');
  const poor = { ...withBoard, rollBudget: { level: 7, xp: 0, gold: 12 } };
  const rich = { ...withBoard, rollBudget: { level: 7, xp: 52, gold: 40 } };
  assert.ok(route(rich, 'high').fit > route(poor, 'high').fit);
  assert.equal(openingDecision(rankOpening(poor)).status, 'lean');
});

test('verified copies increase contest pressure on the exact chased unit and prevent locking that line', () => {
  const input = { ...base, selected: new Set(['cheap', 'front']), unitCopies: new Map([['cheap', 5]]),
    ownedItems: new Set(['sword']) };
  const observed = new Map([['3', { units: ['cheap'], routes: [], unitCopies: new Map([['cheap', 3]]) }]]);
  assert.equal(opponentPressure(high, observed).discount, 0);
  assert.ok(opponentPressure(chase, observed, [{ id: 'cheap' }]).discount > 0);
  const ranked = rankOpening({ ...input, opponentBoards: observed });
  assert.equal(openingDecision(ranked).status, 'lean');
  assert.match(ranked.find(row => row.comp.id === chase.id).reasons.join(' '), /对手.*3 张/);
  assert.equal(openingDecision(rankOpening(base)).status, 'reference');
});
