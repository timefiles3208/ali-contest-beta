const FRONT_TRAITS = new Set([
  'DA_18_Brawler', 'DA_18_Defender', 'DA_18_Vanguard', 'DA_Juggernaut18', 'DA_18_Battlemage',
]);
const BACK_TRAITS = new Set([
  'DA_18_Hunter', 'DA_18_Rapidfire', 'DA_18_Spellweaver', 'DA_18_Invoker',
]);
const TANK_ITEMS = new Set([
  'DA_GargoyleStoneplate', 'DA_WarmogsArmor', 'DA_SpiritVisage', 'DA_BrambleVest',
  'DA_SteadfastHeart', 'DA_Evenshroud', 'DA_SunfireCape', 'DA_DragonsClaw',
]);
const OUTSIDE_IN = [0, 6, 1, 5, 2, 4, 3];
const CENTER_OUT = [3, 2, 4, 1, 5, 0, 6];
const ROLL_LEVEL = { 1: 5, 2: 6, 3: 7, 4: 8, 5: 9 };

export function buildCompGuide(comp, setData) {
  const byId = new Map(setData.units.map(unit => [unit.id, unit]));
  const units = comp.units.flatMap(id => {
    const unit = byId.get(id);
    if (!unit) return [];
    const items = comp.itemBuilds?.[id] ?? comp.items?.[id] ?? [];
    const carry = Boolean(comp.carry?.includes(id));
    const traits = unit.traits || [];
    const tank = Boolean(comp.tank?.includes(id)) || items.some(item => TANK_ITEMS.has(item));
    const front = tank || traits.some(trait => FRONT_TRAITS.has(trait));
    const back = !front && (carry || traits.some(trait => BACK_TRAITS.has(trait)));
    const sourceStars = comp.stars?.[id];
    return [{
      ...unit, items, carry, tank, row: front ? 0 : back ? 3 : 1,
      stars: sourceStars ?? 2, sourceStars: sourceStars != null,
    }];
  });

  const board = Array.from({ length: 4 }, () => Array(7).fill(null));
  for (const unit of [...units].sort((a, b) => Number(b.tank) - Number(a.tank) || Number(b.carry) - Number(a.carry))) {
    const rows = unit.row === 3 ? [3, 2, 1, 0] : unit.row === 0 ? [0, 1, 2, 3] : [1, 2, 0, 3];
    const row = rows.map(i => board[i]).find(cells => cells.includes(null));
    if (!row) break;
    const priority = unit.carry && unit.row === 3 ? OUTSIDE_IN : CENTER_OUT;
    row[priority.find(i => row[i] === null)] = unit;
  }

  const eligible = units.filter(unit => ROLL_LEVEL[unit.cost]);
  const chase = eligible.filter(unit => unit.stars === 3);
  const carries = eligible.filter(unit => unit.carry);
  const geared = eligible.filter(unit => unit.items.length > 0 && !unit.tank);
  const core = eligible.filter(unit => comp.core?.includes(unit.id));
  const focus = chase.length ? chase : carries.length ? carries : geared.length ? geared : core.length ? core : eligible.slice(0, 1);
  const rollsByLevel = new Map();
  for (const unit of focus) {
    const level = ROLL_LEVEL[unit.cost];
    const targets = rollsByLevel.get(level) || [];
    targets.push(unit);
    rollsByLevel.set(level, targets);
  }
  const rolls = [...rollsByLevel].map(([level, targets]) => ({ level, targets })).sort((a, b) => a.level - b.level);
  return { board, units, rolls };
}
