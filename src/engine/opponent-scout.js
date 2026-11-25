import { transitionGuides } from '../data/s18.18.7.transitions.js';

const MIN_DIRECTION_GAP = 3;

function routeEvidence(comp, units, patch) {
  const guide = patch === '18.7' && comp.rank?.source === 'datatft.com' ? transitionGuides[comp.id] : null;
  const opener = guide?.anchors.every(id => comp.units.includes(id)) ? guide.stages[4] : null;
  const opening = (opener || []).filter(id => units.has(id));
  const final = comp.units.filter(id => units.has(id));
  const core = (comp.core || []).filter(id => units.has(id)).length;
  const carries = (comp.carry || []).filter(id => units.has(id)).length;
  if (new Set([...final, ...opening]).size < 2 || (!core && !carries && opening.length < 2)) return 0;
  return final.length * 2 + core * 4 + carries * 3 + opening.length * 2;
}

export function predictOpponentRoutes(comps, opponents = new Map(), patch) {
  const predictions = [];
  for (const [slot, checked] of opponents) {
    const units = new Set(checked);
    if (!units.size) continue;
    const ranked = comps.map(comp => ({ comp, evidence: routeEvidence(comp, units, patch) }))
      .filter(row => row.evidence > 0)
      .sort((a, b) => b.evidence - a.evidence);
    const [best, next] = ranked;
    const clear = best && (!next || best.evidence - next.evidence >= MIN_DIRECTION_GAP);
    predictions.push({ slot, comp: clear ? best.comp : null, units: units.size });
  }
  return predictions;
}

export function competingOpponents(comp, predictions) {
  const carries = new Set(comp.carry || []);
  return predictions.filter(({ comp: other }) =>
    other && (other.id === comp.id || other.carry?.some(id => carries.has(id)))).length;
}
