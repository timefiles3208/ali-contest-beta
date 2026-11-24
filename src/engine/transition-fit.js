import { traitBreakdown } from './recommend.js';

const DAMAGE_TRAITS = [
  new Set(['DA_18_Hunter', 'DA_18_Rapidfire']),
  new Set(['DA_18_Spellweaver', 'DA_18_Invoker']),
];

function itemFit(holder, target, tankItem, frontTraits) {
  if (holder.id === target.id) return 2;
  if (tankItem) return Number(holder.traits.some(trait => frontTraits.has(trait)));
  return Number(DAMAGE_TRAITS.some(group =>
    holder.traits.some(trait => group.has(trait)) && target.traits.some(trait => group.has(trait))));
}

function missingParts(recipe, inventory) {
  return [...recipe].flatMap(([part, count]) =>
    Array(Math.max(0, count - (inventory.get(part) || 0))).fill(part));
}
function openingGear(targets, inventory) {
  const catalog = new Map((inventory.itemsData?.items || []).map(item => [item.id, item]));
  const candidates = new Map();
  for (const target of targets) {
    for (const id of target.items) {
      const item = catalog.get(id);
      if (!item || (item.kind !== 'completed' && !inventory.ownedItems.has(id))) continue;
      const recipe = new Map();
      for (const part of item.from || []) recipe.set(part, (recipe.get(part) || 0) + 1);
      const held = inventory.ownedItems.has(id);
      const missing = held ? [] : missingParts(recipe, inventory.owned);
      if (!held && (!recipe.size || missing.length > 1 || (missing.length === 1 && item.from.length < 2))) continue;
      const row = candidates.get(id) || { item, recipe, held, partial: missing.length > 0, targets: [] };
      row.targets.push(target);
      candidates.set(id, row);
    }
  }
  return [...candidates.values()].sort((a, b) => Number(b.held) - Number(a.held) || Number(a.partial) - Number(b.partial));
}

function assignGear(units, options, inventory, tankItems, frontTraits) {
  const components = new Map(inventory.owned);
  const equipped = new Map();
  const assignments = [];
  let partial;
  for (const { item, recipe, held, targets } of options) {
    const missing = held ? [] : missingParts(recipe, components);
    if (missing.length > 1 || (missing.length && partial)) continue;
    const tankItem = tankItems.has(item.id);
    let best;
    for (const unit of units) {
      if ((equipped.get(unit.id) || 0) >= 3) continue;
      for (const target of targets) {
        const fit = itemFit(unit, target, tankItem, frontTraits);
        if (!fit || (fit !== 2 && item.kind !== 'completed')) continue;
        const priority = fit * 6 + Number(inventory.selected.has(unit.id)) * 8 - unit.cost;
        if (!best || priority > best.priority) best = { unit, target, priority };
      }
    }
    if (!best) continue;
    if (missing.length) {
      partial = { unit: best.unit, target: best.target, item, state: 'partial', missing: missing[0] };
      continue;
    }
    if (!held) for (const [part, count] of recipe) components.set(part, components.get(part) - count);
    equipped.set(best.unit.id, (equipped.get(best.unit.id) || 0) + 1);
    assignments.push({ unit: best.unit, target: best.target, item, state: held ? 'done' : 'ready' });
  }
  return assignments.length || !partial ? assignments : [partial];
}

export function buildAdaptiveTransitions({ comp, setData, targets, stages, inventory, tankItems, frontTraits }) {
  if (!inventory || (!inventory.selected.size && !inventory.owned.size && !inventory.ownedItems.size)) return [];
  const { selected } = inventory;
  const gearOptions = openingGear(targets, inventory);
  const final = new Set(comp.units);
  const held = setData.units.filter(unit => selected.has(unit.id));
  const result = [];
  for (let level = 4; level < (comp.level || comp.units.length) && level <= 7; level++) {
    const base = stages.find(stage => stage.level === level)?.units || [];
    const preferred = new Set(base.map(unit => unit.id));
    const maxCost = Math.min(4, level - 1);
    // A missing unit can be an affordable target or part of the linked guide.
    const pool = [...new Map([...base, ...targets.filter(unit => unit.cost <= maxCost), ...held]
      .map(unit => [unit.id, unit])).values()];
    if (!pool.length) continue;

    const evaluate = units => {
      const traits = traitBreakdown(setData, units.map(unit => unit.id)).filter(trait => trait.tier > 0);
      const gear = assignGear(units, gearOptions, inventory, tankItems, frontTraits);
      const ownedUnits = units.filter(unit => selected.has(unit.id));
      const fit = ownedUnits.length * 8
        + units.reduce((score, unit) => score + Number(final.has(unit.id)) * 2
          + Number(preferred.has(unit.id)) * 2 - (selected.has(unit.id) ? 0 : unit.cost), 0)
        + traits.reduce((score, trait) => score + Math.min(trait.tier, units.length)
          + Number(Boolean(comp.aimTraits?.[trait.id])) * 2, 0)
        + Number(units.some(unit => unit.traits.some(trait => frontTraits.has(trait)))) * 3
        + Math.min(18, gear.reduce((score, row) => score + (row.state === 'done' ? 6 : row.state === 'ready' ? 4 : 2), 0));
      return { units, traits, gear, held: ownedUnits.map(unit => unit.id), fit };
    };

    let best = evaluate([]);
    while (best.units.length < Math.min(level, pool.length)) {
      const choices = pool.filter(unit => !best.units.includes(unit))
        .map(unit => evaluate([...best.units, unit]));
      best = choices.reduce((a, b) => b.fit > a.fit ? b : a);
    }
    // A final replacement pass accounts for traits that only activate on the completed board.
    for (let index = 0; index < best.units.length; index++) {
      const current = best;
      for (const unit of pool) {
        if (current.units.includes(unit)) continue;
        const candidate = evaluate(current.units.with(index, unit));
        if (candidate.fit > best.fit) best = candidate;
      }
    }
    result.push({ ...best, level });
  }
  return result;
}
