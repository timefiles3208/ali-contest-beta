import { buildAdaptiveTransitions } from './transition-fit.js';
import { transitionGuides } from '../data/s18.18.7.transitions.js';
import { traitBreakdown } from './recommend.js';
import { formationPlan, TANK_ITEMS } from './formation.js';

const FRONT_TRAITS = new Set([
  'DA_18_Brawler', 'DA_18_Defender', 'DA_18_Vanguard', 'DA_Juggernaut18', 'DA_18_Battlemage',
]);
const BACK_TRAITS = new Set([
  'DA_18_Hunter', 'DA_18_Rapidfire', 'DA_18_Spellweaver', 'DA_18_Invoker',
]);
const OUTSIDE_IN = [0, 6, 1, 5, 2, 4, 3];
const CENTER_OUT = [3, 2, 4, 1, 5, 0, 6];

export function filterCompPlans(rows, { trait, tier, maxLevel }) {
  return rows.filter(({ comp }) =>
    (!trait || (comp.aimTraits?.[trait] || 0) >= (tier || 1)) &&
    (!maxLevel || comp.level <= maxLevel));
}

function sourcedTransitions(comp, setData, patch, byId) {
  const guide = transitionGuides[comp.id];
  if (setData.set !== 18 || patch !== '18.7' || comp.rank?.source !== 'datatft.com' ||
      !guide || !guide.anchors.every(id => comp.units.includes(id))) return [];

  const source = {
    name: 'TFT Codex', patch,
    url: `https://tftcodex.com/comps/${guide.slug}.html`,
  };
  return Object.entries(guide.stages).flatMap(([key, ids]) => {
    const level = Number(key);
    if (level >= comp.level || ids.length !== level || new Set(ids).size !== level ||
        !ids.every(id => byId.has(id))) return [];
    return [{
      level, source, units: ids.map(id => byId.get(id)),
      traits: traitBreakdown(setData, ids).filter(trait => trait.tier > 0),
    }];
  });
}

export function buildCompGuide(comp, setData, patch, inventory) {
  const byId = new Map(setData.units.map(unit => [unit.id, unit]));
  const plan = formationPlan(comp, byId);
  const units = plan.units.map(unit => {
    const traits = unit.traits || [];
    const front = unit.tank || traits.some(trait => FRONT_TRAITS.has(trait));
    const back = !front && (unit.carry || traits.some(trait => BACK_TRAITS.has(trait)));
    return { ...unit, row: front ? 0 : back ? 3 : 1 };
  });

  const board = Array.from({ length: 4 }, () => Array(7).fill(null));
  for (const unit of [...units].sort((a, b) => Number(b.tank) - Number(a.tank) || Number(b.carry) - Number(a.carry))) {
    const rows = unit.row === 3 ? [3, 2, 1, 0] : unit.row === 0 ? [0, 1, 2, 3] : [1, 2, 0, 3];
    const row = rows.map(i => board[i]).find(cells => cells.includes(null));
    if (!row) break;
    const priority = unit.carry && unit.row === 3 ? OUTSIDE_IN : CENTER_OUT;
    row[priority.find(i => row[i] === null)] = unit;
  }

  const rolls = plan.rolls;
  const transitionUnits = units.filter(unit => unit.cost <= 3)
    .sort((a, b) => a.cost - b.cost || Number(b.tank || b.carry) - Number(a.tank || a.carry))
    .slice(0, 4);
  const transition = {
    units: transitionUnits,
    traits: traitBreakdown(setData, transitionUnits.map(unit => unit.id)).filter(trait => trait.tier > 0),
  };
  const transitionStages = sourcedTransitions(comp, setData, patch, byId);
  const adaptiveTransitions = buildAdaptiveTransitions({
    comp, setData, targets: units, stages: transitionStages, inventory, tankItems: TANK_ITEMS, frontTraits: FRONT_TRAITS,
  });
  return { board, units, rolls, transition, transitionStages, adaptiveTransitions };
}
