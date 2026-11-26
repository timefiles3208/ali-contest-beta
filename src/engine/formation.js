const ROLL_LEVEL = { 1: 5, 2: 6, 3: 7, 4: 8, 5: 9 };
export const FRONT_TRAITS = new Set([
  'DA_18_Brawler', 'DA_18_Defender', 'DA_18_Vanguard', 'DA_Juggernaut18', 'DA_18_Battlemage',
]);
const BACK_TRAITS = new Set([
  'DA_18_Hunter', 'DA_18_Rapidfire', 'DA_18_Spellweaver', 'DA_18_Invoker',
]);

export function formationRow(unit) {
  const traits = unit.traits || [];
  if (unit.tank || traits.some(trait => FRONT_TRAITS.has(trait))) return 0;
  return unit.carry || traits.some(trait => BACK_TRAITS.has(trait)) ? 3 : 1;
}

export const TANK_ITEMS = new Set([
  'DA_GargoyleStoneplate', 'DA_WarmogsArmor', 'DA_SpiritVisage', 'DA_BrambleVest',
  'DA_SteadfastHeart', 'DA_Evenshroud', 'DA_DragonsClaw', 'DA_Crownguard',
]);

export function formationPlan(comp, unitById) {
  const units = comp.units.flatMap(id => {
    const unit = unitById.get(id);
    if (!unit) return [];
    const rollLevel = ROLL_LEVEL[unit.cost] || null;
    const items = comp.itemBuilds?.[id] ?? comp.items?.[id] ?? [];
    const tankItems = items.filter(item => TANK_ITEMS.has(item)).length;
    const sourceStars = comp.stars?.[id];
    return [{
      ...unit, items, tankItems, rollLevel, carry: Boolean(comp.carry?.includes(id)),
      tank: Boolean(comp.tank?.includes(id)) || tankItems > 0,
      core: Boolean(comp.core?.includes(id)), stars: sourceStars ?? 2, sourceStars: sourceStars != null,
    }];
  });
  const eligible = units.filter(unit => unit.rollLevel);
  const explicitCarries = eligible.filter(unit => unit.carry);
  const fallback = eligible.find(unit => unit.items.length && unit.core && !unit.tank)
    || eligible.find(unit => unit.core && !unit.tank) || eligible.find(unit => unit.items.length && !unit.tank)
    || eligible.find(unit => unit.core) || eligible[0];
  const carries = explicitCarries.length ? explicitCarries : fallback ? [fallback] : [];
  const tanks = eligible.filter(unit => comp.tank?.includes(unit.id));
  if (!tanks.length) {
    const tank = eligible.filter(unit => unit.tank && !carries.includes(unit))
      .sort((a, b) => b.tankItems - a.tankItems || Number(b.core) - Number(a.core))[0];
    if (tank) tanks.push(tank);
  }
  const chase = eligible.filter(unit => unit.stars >= 3 &&
    (carries.includes(unit) || tanks.includes(unit) || unit.core || unit.items.length));
  const main = [...new Set([...carries, ...tanks])];
  const rolls = new Map();
  for (const unit of new Set([...main, ...chase])) {
    const targets = rolls.get(unit.rollLevel) || [];
    targets.push(unit);
    rolls.set(unit.rollLevel, targets);
  }
  const levelingDemand = Math.max(0, ...main.filter(unit => unit.stars < 3).map(unit => unit.rollLevel - 7));
  return {
    units, carries, tanks, chase, levelingDemand, finishLevel: comp.level,
    rolls: [...rolls].map(([level, targets]) => ({ level, targets })).sort((a, b) => a.level - b.level),
  };
}
