import { economyBenefits } from './augments.js?v=formation-plan';
import { cityFit, formationPlan, formationRow } from './formation.js?v=scout-direction';
import { artifactOptions, radiantOptions, recommendArtifacts } from './artifacts.js?v=opponent-equipment';
import { transitionGuides } from '../data/s18.18.7.transitions.js';

const RISK = [12, 8, 5];
const TIERS = ['E', 'D', 'C', 'B', 'A', 'S', 'S+'];
const EQUIPPED_EVIDENCE = 5;
const EQUIPPED_CONTEST_DISCOUNT = 4;

export function opponentEconomy(gold) {
  if (!Number.isInteger(gold) || gold < 0) return '';
  if (gold >= 20) return 'high';
  return gold < 10 ? 'low' : 'normal';
}

export function scoutEquipmentOptions(patch, itemsData, sourceItems) {
  const completed = (itemsData?.items || []).filter(item => item.kind === 'completed')
    .map(item => ({ ...item, baseId: item.id, ordinary: true }));
  return [...completed, ...artifactOptions(patch, sourceItems), ...radiantOptions(patch, itemsData, sourceItems)];
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
  const dedicated = linkedAugments.some(aug => aug.grantsTraits.some(id => comp.aimTraits?.[id])
    || aug.units.some(id => comp.carry?.includes(id)));
  const multipleCores = (comp.carry || []).filter(id => (profile.unitCopies.get(id) ?? 0) >= 2);
  const boardHits = hits + traitMatches.length + multipleCores.length;
  const hasBoardEvidence = boardHits >= 2 || (linkedAugments.length && (boardHits || dedicated));
  const hasRouteEvidence = core || carries || opening.length >= 2 || traitMatches.length || linkedAugments.length;
  const equipped = profile.equipment.some(item => item.unit && comp.units.includes(item.unit));
  if ((!hasBoardEvidence || !hasRouteEvidence) && !equipped && !dedicated
    && !profile.equipment.some(item => item.ordinary && !item.unit)) return null;
  const formation = formationPlan(comp, unitById);
  let equipmentScore = 0;
  let ordinaryMatch = false;
  if (profile.equipment.length) {
    for (const unit of formation.units) {
      const candidates = profile.equipment.filter(item => item.unit === unit.id || (!item.unit && (units.has(unit.id) || item.ordinary)));
      if (!candidates.length) continue;
      const recommended = candidates.some(item => !item.baseId)
        ? recommendArtifacts({ ...unit, row: formationRow(unit) }, patch, profile.sourceItems) : [];
      for (const item of candidates) {
        const compatible = item.baseId ? unit.items.includes(item.baseId) : recommended.some(option => option.id === item.id);
        if (compatible) {
          ordinaryMatch ||= item.ordinary;
          equipmentScore = Math.max(equipmentScore, item.unit ? EQUIPPED_EVIDENCE : item.ordinary ? 2 : 1);
        }
      }
    }
  }
  const equippedMatch = equipmentScore === EQUIPPED_EVIDENCE;
  if ((!hasBoardEvidence || !hasRouteEvidence) && !equippedMatch && !ordinaryMatch && !dedicated) return null;
  const chase = formation.chase.filter(unit => unit.cost <= 3);
  const reroll = chase.length > 0;
  const leadChase = chase.map(unit => ({ unit, count: profile.unitCopies.get(unit.id) ?? 0 }))
    .filter(row => row.count >= 2).sort((a, b) => b.count - a.count)[0];
  const leveling = formation.levelingDemand > 0 && !reroll;
  const cheap = formation.carries.length && formation.carries.every(unit => unit.cost <= 3);
  const economy = (profile.economy === 'high' && leveling) || (profile.economy === 'low' && (reroll || (cheap && !leveling))) ? 3 : 0;
  const economicAugment = (leveling && (profile.benefits.grantsGold || profile.benefits.grantsXP))
    || (reroll && profile.benefits.grantsRolls) ? 2 : 0;
  const earlyUnits = [...new Set([...opening, ...final])].filter(id => unitById.get(id)?.cost <= 3);
  const upgradedOpener = earlyUnits.length >= 2 && earlyUnits.some(id => (profile.unitCopies.get(id) ?? 0) >= 3);
  const levelReady = leveling && upgradedOpener && (profile.economy === 'high' || economicAugment > 0);
  const encounter = cityFit(profile.city, comp, equipmentScore * 3, unitById, formation);
  const confidence = (leadChase?.count >= 3 && (equippedMatch || dedicated)) || (levelReady && equippedMatch)
    ? 'strong' : equippedMatch || (hasBoardEvidence && hasRouteEvidence && (hits >= 2 || traitMatches.length >= 2))
      ? 'likely' : 'tentative';
  const evidence = final.length * 2 + core * 4 + carries * 3 + opening.length * 2
    + traitMatches.reduce((sum, [, level]) => sum + Math.min(level, 5), 0)
    + Math.min(8, linkedAugments.length * 5) + economy + economicAugment + equipmentScore
    + Math.min(6, multipleCores.reduce((sum, id) => sum + profile.unitCopies.get(id), 0))
    + Math.min(5, encounter) + (dedicated ? 4 : 0) + (levelReady ? 4 : 0)
    + (leadChase ? Math.min(4, leadChase.count - 1) : 0);
  const reasons = [
    leadChase && leadChase.unit.name + ' ' + leadChase.count + ' 张，目标三星',
    equippedMatch ? '装备契合佩戴棋子' : ordinaryMatch && '成装方向吻合',
    dedicated && '已选专属海克斯',
    levelReady ? '过渡已升星，经济支持冲高费' : leveling && economy > 0 && '经济支持考虑高费',
    encounter > 0 && '契合' + profile.city.name,
  ].filter(Boolean);
  return { comp, evidence, equippedMatch, confidence, reasons };
}

export function predictOpponentRoutes(comps, { units = [], traits = [], gold, economy, augments = [], artifacts = [], unitCopies = new Map() }, patch, { setData, itemsData, sourceItems, city } = {}) {
  const knownTraits = new Set(traits);
  const roster = setData?.units || [];
  const unitById = new Map(roster.map(unit => [unit.id, unit]));
  const available = artifacts.length ? scoutEquipmentOptions(patch, itemsData, sourceItems) : [];
  const equipmentById = new Map(available.map(item => [item.id, item]));
  const equipment = artifacts.filter(item => equipmentById.has(item.id) && (!item.unit || unitById.has(item.unit)))
    .map(item => ({ ...item, baseId: equipmentById.get(item.id).baseId, ordinary: equipmentById.get(item.id).ordinary }));
  const knownUnits = new Set([...units, ...unitCopies.keys(), ...equipment.map(item => item.unit).filter(Boolean)]);
  const traitsByName = new Map((setData?.traits || []).map(row => [row.name, row.id]));
  const unitsByName = new Map(roster.map(row => [row.name, row.id]));
  const profile = {
    equipment, sourceItems, unitCopies, city,
    economy: economy || opponentEconomy(gold),
    benefits: economyBenefits(augments.map(aug => aug.desc || '').join('\n')),
    augments: augments.map(aug => ({
      traits: [...(aug.traits || []), ...(aug.grantTraits || []), ...(aug.mentionsTraits || []).map(name => traitsByName.get(name)).filter(Boolean)],
      grantsTraits: aug.grantTraits || [],
      units: (aug.grantUnits || []).map(name => unitsByName.get(name) || name),
    })),
  };
  return comps.map(comp => routeEvidence(comp, knownUnits, knownTraits, profile, patch, unitById))
    .filter(Boolean)
    .sort((a, b) => b.evidence - a.evidence
      || TIERS.indexOf(b.comp.rank?.tier) - TIERS.indexOf(a.comp.rank?.tier)
      || (b.comp.rank?.top4 ?? 0) - (a.comp.rank?.top4 ?? 0))
    .slice(0, 3);
}

export function opponentPressure(comp, boards, chase = []) {
  const carries = new Set(comp.carry || []);
  let opponents = 0;
  let pressure = 0;
  let equippedOpponents = 0;
  let contestedCopies = 0;
  for (const { routes, unitCopies } of boards.values()) {
    const sharedRisk = routes.reduce((best, route) => {
      const other = route.comp;
      if (other.id !== comp.id && !other.carry?.some(id => carries.has(id))) return best;
      const risk = RISK[routes.findIndex(row => row.evidence === route.evidence)];
      return Math.max(best, route.confidence === 'tentative' ? Math.ceil(risk / 2) : risk);
    }, 0);
    const copies = Math.max(0, ...chase.map(unit => unitCopies?.get(unit.id) ?? 0));
    if (!sharedRisk && copies < 2) continue;
    opponents++;
    pressure += sharedRisk;
    if (copies >= 2) {
      contestedCopies += copies;
      pressure += Math.min(8, (copies - 1) * 2);
    }
    if (routes.some(row => row.comp.id === comp.id && row.equippedMatch)) {
      equippedOpponents++;
      pressure += EQUIPPED_CONTEST_DISCOUNT;
    }
  }
  return { opponents, discount: Math.min(28, pressure), ...(equippedOpponents ? { equippedOpponents } : {}), ...(contestedCopies ? { contestedCopies } : {}) };
}
