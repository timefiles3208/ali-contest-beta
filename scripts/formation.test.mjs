import assert from 'node:assert/strict';
import test from 'node:test';
import { formationPlan } from '../src/engine/formation.js';
import { buildCompGuide } from '../src/engine/comp-guide.js';
import { rankOpening } from '../src/engine/opening.js';

const units = [
  { id: 'one', name: '低费主C', cost: 1, traits: [] },
  { id: 'tank', name: '低费主坦', cost: 2, traits: [] },
  { id: 'late', name: '高费主C', cost: 5, traits: [] },
  { id: 'splash', name: '挂件', cost: 1, traits: [] },
];
const setData = { units, traits: [] };
const roster = new Map(units.map(unit => [unit.id, unit]));
const reroll = {
  id: 'reroll', name: '追三', units: ['one', 'tank', 'splash'], core: ['one', 'tank'],
  carry: ['one'], items: { tank: ['DA_BrambleVest'] }, stars: { one: 3, tank: 3, splash: 3 }, level: 9,
  rank: { tier: 'S' },
};
const fast = {
  id: 'fast', name: '找五费', units: ['late', 'splash'], core: ['late'],
  carry: ['late'], stars: { splash: 3 }, level: 9, rank: { tier: 'A' },
};

test('equal final population can mean different carry costs, chase goals and roll stages', () => {
  const low = formationPlan(reroll, roster);
  const high = formationPlan(fast, roster);
  assert.equal(low.finishLevel, high.finishLevel);
  assert.deepEqual(low.chase.map(unit => [unit.id, unit.cost, unit.stars]), [['one',1,3],['tank',2,3]]);
  assert.deepEqual(low.rolls.map(({ level, targets }) => [level, targets.map(unit => unit.id)]), [[5,['one']],[6,['tank']]]);
  assert.equal(high.chase.length, 0);
  assert.equal(high.rolls[0].level, 9);
  assert.equal(high.carries[0].stars, 2);
  assert.equal(high.carries[0].sourceStars, false);
  assert.equal(buildCompGuide(reroll, setData).rolls[0].level, low.rolls[0].level);
});

test('high economy favors accessible high-cost routes and held early chase targets matter more than final population', () => {
  const input = { setData, comps:[reroll,fast], selected:new Set(['one','late']), owned:new Map(), ownedItems:new Set() };
  const high = rankOpening({ ...input, economy:'high' });
  const low = rankOpening({ ...input, economy:'low' });
  assert.equal(high[0].comp.id, 'fast');
  assert.equal(low[0].comp.id, 'reroll');
  assert.match(low[0].reasons.join(' '), /已持有.*追星/);
});
