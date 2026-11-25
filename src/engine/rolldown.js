// S18 18.7 standard shop; each row is the chance by cost for one slot.
const SHOP_ODDS = [
  null, [100, 0, 0, 0, 0], [100, 0, 0, 0, 0], [75, 25, 0, 0, 0],
  [55, 30, 15, 0, 0], [45, 33, 20, 2, 0], [30, 40, 25, 5, 0], [19, 30, 40, 10, 1],
  [15, 20, 32, 30, 3], [10, 17, 25, 33, 15], [5, 10, 20, 40, 25],
];
const BAG_SIZE = [30, 25, 18, 10, 9];
const TIER_SIZE = [14, 13, 14, 14, 10];
const NEXT_LEVEL_XP = [0, 2, 2, 6, 10, 20, 36, 56, 68, 68];
const STAR_COPIES = [0, 1, 3, 9];

export function validRollBudget({ level, gold } = {}) {
  return Number.isInteger(level) && Boolean(SHOP_ODDS[level]) &&
    Number.isInteger(gold) && gold >= 0 && gold <= 200;
}

export function estimateRolldown(unit, { level, gold, xp = 0, held = 0, contested = 0 }) {
  const tier = unit.cost - 1;
  const bag = BAG_SIZE[tier];
  if (!bag || unit.traits?.includes('DA_Riftbeast18') || !validRollBudget({ level, gold })) return null;
  const missing = Math.max(0, (STAR_COPIES[unit.stars] ?? 3) - held);
  const removed = Math.min(bag, held + contested);
  const available = bag - removed;
  const tierAvailable = bag * TIER_SIZE[tier] - removed;

  function scenario(atLevel, levelGold) {
    const buyGold = missing * unit.cost;
    const refreshes = Math.max(0, Math.floor((gold - levelGold - buyGold) / 2));
    const odds = SHOP_ODDS[atLevel][tier] / 100;
    const result = { level: atLevel, levelGold, buyGold, refreshes, missing, probability: 0 };
    if (!missing) return { ...result, probability: 1 };
    if (missing > available || !refreshes || !odds) return result;

    // Reserve gold to buy all missing copies, then approximate the five slots
    // per refresh. Bought copies leave the shared pool as the search progresses.
    const chances = new Float64Array(missing + 1);
    chances[0] = 1;
    for (let slot = 0; slot < refreshes * 5; slot++) {
      for (let seen = missing - 1; seen >= 0; seen--) {
        const hit = chances[seen] * odds * (available - seen) / (tierAvailable - seen);
        chances[seen] -= hit;
        chances[seen + 1] += hit;
      }
    }
    return { ...result, probability: Math.min(1, chances[missing]) };
  }

  const current = scenario(level, 0);
  const target = unit.rollLevel;
  if (target <= level || !SHOP_ODDS[target] || !missing) return { current, upgrade: null };
  const earned = Math.max(0, Math.min(NEXT_LEVEL_XP[level], xp));
  const required = NEXT_LEVEL_XP.slice(level, target).reduce((sum, amount) => sum + amount, 0) - earned;
  return { current, upgrade: scenario(target, Math.ceil(required / 4) * 4) };
}

export function rolldownSummary({ unit, current, upgrade }) {
  if (!current.missing) return `搜牌估算 · ${unit.name} 已达到目标 ${unit.stars} 星`;
  const chance = n => n > 0 && n < .005 ? '<1%' : `${Math.round(n * 100)}%`;
  const explain = row => `${row.level} 级 ${chance(row.probability)}（${row.refreshes} 次刷新${row.levelGold ? `，升级 ${row.levelGold} 金` : ''}）`;
  return [
    `搜牌估算 · ${unit.name} ${unit.stars} 星还差 ${current.missing} 张`,
    explain(current), upgrade && explain(upgrade),
  ].filter(Boolean).join(' · ');
}
