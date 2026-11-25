import { economyBenefits } from './augments.js?v=opponent-profile';
import { transitionGuides } from '../data/s18.18.7.transitions.js';

const RISK = [12, 8, 5];
const TIERS = ['E', 'D', 'C', 'B', 'A', 'S', 'S+'];

export function opponentEconomy(gold) {
  if (!Number.isInteger(gold) || gold < 0) return '';
  if (gold >= 20) return 'high';
  return gold < 10 ? 'low' : 'normal';
}

function routeEvidence(comp, units, traits, profile, patch, lowCostUnits) {
  const guide = patch === '18.7' && comp.rank?.source === 'datatft.com' ? transitionGuides[comp.id] : null;
  const opener = guide?.anchors.every(id => comp.units.includes(id)) ? guide.stages[4] : null;
  const opening = (opener || []).filter(id => units.has(id));
  const final = comp.units.filter(id => units.has(id));
  const core = (comp.core || []).filter(id => units.has(id)).length;
  const carries = (comp.carry || []).filter(id => units.has(id)).length;
  const traitMatches = Object.entries(comp.aimTraits || {}).filter(([id]) => traits.has(id));
  const hits = new Set([...final, ...opening]).size;
  const linkedAugments = profile.augments.filter(aug => aug.traits.some(id => comp.aimTraits?.[id])
    || aug.units.some(id => comp.core?.includes(id) || comp.carry?.includes(id)));
  const dedicated = linkedAugments.some(aug => aug.grantsTraits.some(id => comp.aimTraits?.[id]));
  const boardHits = hits + traitMatches.length;
  if (boardHits < 2 && !(linkedAugments.length && (boardHits || dedicated))) return 0;
  if (!core && !carries && opening.length < 2 && !traitMatches.length && !linkedAugments.length) return 0;

  const reroll = comp.level <= 7 || lowCostUnits.some(id => comp.stars?.[id] === 3);
  const leveling = comp.level >= 8 && !reroll;
  const economy = (profile.economy === 'high' && leveling) || (profile.economy === 'low' && reroll) ? 3 : 0;
  const economicAugment = (leveling && (profile.benefits.grantsGold || profile.benefits.grantsXP))
    || (reroll && profile.benefits.grantsRolls) ? 2 : 0;
  return final.length * 2 + core * 4 + carries * 3 + opening.length * 2
    + traitMatches.reduce((sum, [, level]) => sum + Math.min(level, 5), 0)
    + Math.min(8, linkedAugments.length * 5) + economy + economicAugment;
}

export function predictOpponentRoutes(comps, { units = [], traits = [], gold, economy, augments = [] }, patch, { setData } = {}) {
  const knownUnits = new Set(units);
  const knownTraits = new Set(traits);
  const roster = setData?.units || [];
  const traitsByName = new Map((setData?.traits || []).map(row => [row.name, row.id]));
  const unitsByName = new Map(roster.map(row => [row.name, row.id]));
  const profile = {
    economy: economy || opponentEconomy(gold),
    benefits: economyBenefits(augments.map(aug => aug.desc || '').join('\n')),
    augments: augments.map(aug => ({
      traits: [...(aug.traits || []), ...(aug.grantTraits || []), ...(aug.mentionsTraits || []).map(name => traitsByName.get(name)).filter(Boolean)],
      grantsTraits: aug.grantTraits || [],
      units: (aug.grantUnits || []).map(name => unitsByName.get(name) || name),
    })),
  };
  const lowCostUnits = roster.filter(unit => unit.cost <= 3).map(unit => unit.id);
  return comps.map(comp => ({ comp, evidence: routeEvidence(comp, knownUnits, knownTraits, profile, patch, lowCostUnits) }))
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
