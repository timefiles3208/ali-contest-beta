import { transitionGuides } from '../data/s18.18.7.transitions.js';

const RISK = [12, 8, 5];
const TIERS = ['E', 'D', 'C', 'B', 'A', 'S', 'S+'];

function routeEvidence(comp, units, traits, patch) {
  const guide = patch === '18.7' && comp.rank?.source === 'datatft.com' ? transitionGuides[comp.id] : null;
  const opener = guide?.anchors.every(id => comp.units.includes(id)) ? guide.stages[4] : null;
  const opening = (opener || []).filter(id => units.has(id));
  const final = comp.units.filter(id => units.has(id));
  const core = (comp.core || []).filter(id => units.has(id)).length;
  const carries = (comp.carry || []).filter(id => units.has(id)).length;
  const traitMatches = Object.entries(comp.aimTraits || {}).filter(([id]) => traits.has(id));
  const hits = new Set([...final, ...opening]).size;
  if (hits + traitMatches.length < 2 || (!core && !carries && opening.length < 2 && !traitMatches.length)) return 0;
  return final.length * 2 + core * 4 + carries * 3 + opening.length * 2
    + traitMatches.reduce((sum, [, level]) => sum + Math.min(level, 5), 0);
}

export function predictOpponentRoutes(comps, { units = [], traits = [] }, patch) {
  const knownUnits = new Set(units);
  const knownTraits = new Set(traits);
  return comps.map(comp => ({ comp, evidence: routeEvidence(comp, knownUnits, knownTraits, patch) }))
    .filter(row => row.evidence > 0)
    .sort((a, b) => b.evidence - a.evidence
      || TIERS.indexOf(b.comp.rank?.tier) - TIERS.indexOf(a.comp.rank?.tier)
      || (b.comp.rank?.top4 ?? 0) - (a.comp.rank?.top4 ?? 0))
    .slice(0, 3);
}

export function opponentPressure(comp, boards) {
  const carries = new Set(comp.carry || []);
  let opponents = 0;
  let pressure = 0;
  for (const { routes } of boards.values()) {
    const index = routes.findIndex(({ comp: other }) => other.id === comp.id || other.carry?.some(id => carries.has(id)));
    if (index < 0) continue;
    opponents++;
    const firstWithEvidence = routes.findIndex(row => row.evidence === routes[index].evidence);
    pressure += RISK[firstWithEvidence];
  }
  return { opponents, discount: Math.min(28, pressure) };
}
