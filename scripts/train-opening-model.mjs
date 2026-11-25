import { readFileSync, writeFileSync } from 'node:fs';
import { adaptBoard } from '../src/adapters/board-sources.js';
import { transitionGuides } from '../src/data/s18.18.7.transitions.js';
import { rankOpening } from '../src/engine/opening.js';
import { openingModelFeatures, OPENING_FEATURE_COUNT, openingModelBonus, MAX_LEARNED_BONUS } from '../src/engine/opening-model.js';

const load = (name) => JSON.parse(readFileSync(new URL('../src/data/' + name, import.meta.url), 'utf8'));
const setData = load('set18.json');
const itemsData = load('set18.items.json');
const snapshot = load('datatft/s18.18.7.comps.json');
const { comps } = adaptBoard(snapshot, { source: 'datatft', setData, items: itemsData });
const catalog = new Map(setData.units.map(unit => [unit.id, unit]));
const items = new Map(itemsData.items.map(item => [item.id, item]));
const routes = Object.entries(transitionGuides).filter(([id, guide]) =>
  comps.some(comp => comp.id === id && guide.anchors.every(anchor => comp.units.includes(anchor))));
const openingKey = (units) => [...units].sort().join('|');
const authorizedIds = new Map();
for (const [id, guide] of routes) {
  const key = openingKey(guide.stages[4]);
  const peers = authorizedIds.get(key) || new Set();
  peers.add(id);
  authorizedIds.set(key, peers);
}

const groups = new Map();
const lowCost = setData.units.filter(unit => unit.cost <= 2).map(unit => unit.id);
for (const [id, guide] of routes) {
  const comp = comps.find(row => row.id === id);
  const group = openingKey(guide.stages[4]);
  const examples = groups.get(group) || [];
  const item = [...new Set(Object.values(comp.items).flat())].map(id => items.get(id))
    .find(item => item?.kind === 'completed' && item.from?.length);
  const playable = ids => ids.filter(unit => catalog.get(unit)?.cost <= 3);
  for (const [stageIndex, [size, units]] of Object.entries(guide.stages).entries()) {
    const visible = playable(units);
    if (visible.length < 2) continue;
    const noise = lowCost[(Number(id.split('-').at(-1)) + Number(size) * 13) % lowCost.length];
    const cases = [
      { units: visible, parts: [], gear: [] },
      { units: visible.filter((_, index) => index !== stageIndex % visible.length), parts: item?.from.slice(0, 1) || [], gear: [] },
      { units: [...visible.filter((_, index) => index !== (stageIndex + 1) % visible.length), noise], parts: [], gear: item ? [item.id] : [] },
    ];
    for (const sample of cases) {
      const selected = new Set(sample.units);
      if (!openingModelFeatures(comp, selected, 0)) continue;
      const context = {
        setData, comps, itemsData, selected, level: Number(size),
        owned: new Map(sample.parts.map(part => [part, 1])), ownedItems: new Set(sample.gear),
      };
      examples.push({
        group, context, accepted: authorizedIds.get(group),
        candidates: rankOpening(context).map(row => ({
          id: row.comp.id, fit: row.fit, viable: row.viable,
          features: openingModelFeatures(row.comp, selected, row.gearPoints),
        })),
      });
    }
  }
  groups.set(group, examples);
}

const zero = Array(OPENING_FEATURE_COUNT).fill(0);
function trainingPairs(examples) {
  return examples.flatMap(({ accepted, candidates }) => {
    const positive = candidates.find(row => accepted.has(row.id) && row.features);
    if (!positive) return [];
    return candidates.filter(row => !accepted.has(row.id)).slice(0, 12).map(negative => ({
      fitGap: positive.fit - negative.fit,
      positive: positive.features,
      negative: negative.features || zero,
    }));
  });
}

function train(pairs) {
  if (!pairs.length) throw new Error('No eligible opening pairs');
  const weights = [...zero];
  const regularization = 0.0008;
  for (let epoch = 0; epoch < 650; epoch++) {
    const gradient = [...zero];
    for (const { fitGap, positive, negative } of pairs) {
      const margin = (fitGap + openingModelBonus(positive, weights) - openingModelBonus(negative, weights)) / 8;
      const error = -1 / (1 + Math.exp(margin)) / 8;
      const predicted = vector => vector.reduce((sum, value, i) => sum + value * weights[i], 0);
      const pos = predicted(positive) < MAX_LEARNED_BONUS;
      const neg = predicted(negative) < MAX_LEARNED_BONUS;
      for (let i = 0; i < weights.length; i++) gradient[i] += error * ((pos ? positive[i] : 0) - (neg ? negative[i] : 0));
    }
    for (let i = 0; i < weights.length; i++) {
      weights[i] = Math.max(0, weights[i] - 1.8 * (gradient[i] / pairs.length + regularization * weights[i]));
    }
  }
  return weights.map(value => Math.round(value * 1e6) / 1e6);
}

function placement(example, weights) {
  const model = weights ? { season: snapshot.season, patch: snapshot.version, source: snapshot.source, weights } : undefined;
  const ranked = rankOpening({ ...example.context, patch: snapshot.version, model });
  return ranked.findIndex(row => example.accepted.has(row.comp.id)) + 1;
}
const examples = [...groups.values()].flat();
const pairs = trainingPairs(examples);
const evaluation = { cases: 0, baselineTop1: 0, modelTop1: 0, baselineTop3: 0, modelTop3: 0 };
for (const [group, heldOut] of groups) {
  const weights = train(trainingPairs(examples.filter(example => example.group !== group)));
  for (const example of heldOut) {
    const baseline = placement(example);
    const trained = placement(example, weights);
    evaluation.cases++;
    evaluation.baselineTop1 += Number(baseline === 1);
    evaluation.modelTop1 += Number(trained === 1);
    evaluation.baselineTop3 += Number(baseline <= 3);
    evaluation.modelTop3 += Number(trained <= 3);
  }
}
const model = {
  season: snapshot.season, patch: snapshot.version, source: snapshot.source,
  algorithm: 'pairwise-logistic-ranker', weights: train(pairs),
  referenceBoards: routes.reduce((count, [, guide]) => count + Object.keys(guide.stages).length, 0),
  routeGroups: groups.size, trainingPairs: pairs.length, evaluation,
  labels: 'curated S18 guides with simulated partial opening inventory; not observed game outcomes',
};

console.log(JSON.stringify(model, null, 2));
if (process.argv.includes('--write')) {
  writeFileSync(new URL('../src/data/s18.18.7.opening-model.js', import.meta.url),
    'export const openingModel = ' + JSON.stringify(model, null, 2) + ';\n');
}
