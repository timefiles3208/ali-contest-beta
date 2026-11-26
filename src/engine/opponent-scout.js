import { economyBenefits } from './augments.js?v=formation-plan';
import { formationPlan, formationRow } from './formation.js?v=opponent-artifacts';
import { artifactOptions, recommendArtifacts } from './artifacts.js?v=opponent-artifacts';
import { transitionGuides } from '../data/s18.18.7.transitions.js';

const RISK = [12, 8, 5];
const TIERS = ['E', 'D', 'C', 'B', 'A', 'S', 'S+'];
const EQUIPPED_ARTIFACT_SCORE = 5;

export function opponentEconomy(gold) {
  if (!Number.isInteger(gold) || gold < 0) return '';
  if (gold >= 20) return 'high';
  return gold < 10 ? 'low' : 'normal';
}

function routeEvidence(comp, units, traits, profile, patch, unitById) {
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
  const hasBoardEvidence = boardHits >= 2 || (linkedAugments.length && (boardHits || dedicated));
  const hasRouteEvidence = core || carries || opening.length >= 2 || traitMatches.length || linkedAugments.length;
  const equipped = profile.artifacts.some(item => item.unit && comp.units.includes(item.unit));
  if ((!hasBoardEvidence || !hasRouteEvidence) && !equipped) return 0;
  const formation = formationPlan(comp, unitById);
  let artifactScore = 0;
  if (profile.artifacts.length) {
    for (const unit of formation.units) {
      const candidates = profile.artifacts.filter(item => item.unit === unit.id || (!item.unit && units.has(unit.id)));
      if (!candidates.length) continue;
      const recommended = recommendArtifacts({ ...unit, row: formationRow(unit) }, patch, profile.sourceItems);
      for (const item of candidates) {
        if (recommended.some(option => option.id === item.id)) {
          artifactScore = Math.max(artifactScore, item.unit ? EQUIPPED_ARTIFACT_SCORE : 1);
        }
      }
    }
  }
  const equippedMatch = artifactScore === EQUIPPED_ARTIFACT_SCORE;
  if ((!hasBoardEvidence || !hasRouteEvidence) && !equippedMatch) return 0;
  const reroll = formation.chase.some(unit => unit.cost <= 3);
  const leveling = formation.levelingDemand > 0 && !reroll;
  const cheap = formation.carries.length && formation.carries.every(unit => unit.cost <= 3);
  const economy = (profile.economy === 'high' && leveling) || (profile.economy === 'low' && (reroll || (cheap && !leveling))) ? 3 : 0;
  const economicAugment = (leveling && (profile.benefits.grantsGold || profile.benefits.grantsXP))
    || (reroll && profile.benefits.grantsRolls) ? 2 : 0;
  return final.length * 2 + core * 4 + carries * 3 + opening.length * 2
    + traitMatches.reduce((sum, [, level]) => sum + Math.min(level, 5), 0)
    + Math.min(8, linkedAugments.length * 5) + economy + economicAugment + artifactScore;
}

export function predictOpponentRoutes(comps, { units = [], traits = [], gold, economy, augments = [], artifacts = [] }, patch, { setData, sourceItems } = {}) {
  const knownTraits = new Set(traits);
  const roster = setData?.units || [];
  const unitById = new Map(roster.map(unit => [unit.id, unit]));
  const allowedArtifacts = new Set(artifacts.length ? artifactOptions(patch, sourceItems).map(item => item.id) : []);
  const observedArtifacts = artifacts.filter(item => allowedArtifacts.has(item.id) && (!item.unit || unitById.has(item.unit)));
  const knownUnits = new Set([...units, ...observedArtifacts.map(item => item.unit).filter(Boolean)]);
  const traitsByName = new Map((setData?.traits || []).map(row => [row.name, row.id]));
  const unitsByName = new Map(roster.map(row => [row.name, row.id]));
  const profile = {
    artifacts: observedArtifacts, sourceItems,
    economy: economy || opponentEconomy(gold),
    benefits: economyBenefits(augments.map(aug => aug.desc || '').join('\n')),
    augments: augments.map(aug => ({
      traits: [...(aug.traits || []), ...(aug.grantTraits || []), ...(aug.mentionsTraits || []).map(name => traitsByName.get(name)).filter(Boolean)],
      grantsTraits: aug.grantTraits || [],
      units: (aug.grantUnits || []).map(name => unitsByName.get(name) || name),
    })),
  };
  return comps.map(comp => ({ comp, evidence: routeEvidence(comp, knownUnits, knownTraits, profile, patch, unitById) }))
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
