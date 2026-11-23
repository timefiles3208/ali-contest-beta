// 动态羁绊路线：不看「理想阵容」，只看「现在这批棋子再抓谁最省事」。
// 人数并不等于层数，所以每一档都用卡池真实阈值算，而不是猜。
import { buildUnitIndex, tierFor } from './recommend.js';

export function traitPaths({ setData, selected, aimTraits = {}, compUnits = [], traitRanks = [] }) {
  const index = buildUnitIndex(setData);
  const sel = selected instanceof Set ? selected : new Set(selected);
  const compSet = new Set(compUnits);
  // 榜单口径：这套羁绊在多少套热门阵容里成立、平均前四多少，只用来微调排序，不盖过场上事实。
  const boardById = new Map((traitRanks || []).map((t) => [t.id, t]));
  const boardBonus = (id) => {
    const b = boardById.get(id);
    if (!b) return 0;
    return Math.max(-0.08, Math.min(0.14, ((b.avgTop4 || 50) - 50) / 90 + Math.min(b.boards || 0, 8) / 120));
  };

  const pools = new Map();
  for (const u of setData.units) {
    for (const t of u.traits || []) {
      if (!pools.has(t)) pools.set(t, []);
      pools.get(t).push(u);
    }
  }

  const owned = new Map();
  for (const id of sel) {
    for (const t of index.byId.get(id)?.traits || []) owned.set(t, (owned.get(t) || 0) + 1);
  }

  const rows = [];
  for (const [id, num] of owned) {
    const trait = (setData.traits || []).find((t) => t.id === id) || { id, name: index.traitNames.get(id) || id, tiers: [] };
    const mins = [...new Set((trait.tiers || []).map((x) => x.min))].sort((a, b) => a - b);
    const tier = tierFor(num, trait.tiers);
    const nextMin = mins.find((m) => m > num) ?? null;
    const pool = pools.get(id) || [];
    const aim = aimTraits[id] ?? null;
    // 卡池里已经没有可抓的人了(全在手上或已被买空)，这条路就是死路，别再提示。
    const remaining = pool.filter((u) => !sel.has(u.id));
    const capped = nextMin === null || remaining.length === 0;
    const peopleNeeded = capped ? 0 : nextMin - num;
    const candidates = remaining
      .slice()
      .sort((a, b) => (compSet.has(b.id) - compSet.has(a.id)) || a.cost - b.cost || a.name.localeCompare(b.name, 'zh'))
      .slice(0, 4);

    let score = 0;
    if (tier > 0) score += 0.2 + Math.min(tier, 7) / 20;
    if (aim && num < aim) score += 0.45;
    if (!capped && peopleNeeded <= 1 && candidates.length) score += 0.25;
    else if (!capped && peopleNeeded <= 2 && candidates.length) score += 0.12;
    if (candidates.some((c) => c.cost <= 3)) score += 0.1;

    rows.push({ id, name: trait.name, num, tier, nextMin, peopleNeeded, capped, aim, candidates, board: boardById.get(id) || null, score: score + boardBonus(id) });
  }

  for (const id of Object.keys(aimTraits)) {
    if (owned.has(id)) continue;
    const trait = (setData.traits || []).find((t) => t.id === id);
    if (!trait) continue;
    const mins = [...new Set((trait.tiers || []).map((x) => x.min))].sort((a, b) => a - b);
    const first = mins[0] ?? null;
    const candidates = (pools.get(id) || [])
      .filter((u) => !sel.has(u.id))
      .sort((a, b) => (compSet.has(b.id) - compSet.has(a.id)) || a.cost - b.cost)
      .slice(0, 4);
    rows.push({
      id,
      name: trait.name,
      num: 0,
      tier: 0,
      nextMin: first,
      peopleNeeded: first === null ? 0 : first,
      capped: first === null || !candidates.length,
      aim: aimTraits[id],
      candidates,
      board: boardById.get(id) || null,
      score: (candidates.length ? 0.3 : 0) + boardBonus(id),
    });
  }

  // 1 个人的散羁绊不值得单独占一行，除非它已经是激活档、或本来就是目标阵容要凑的。
  return rows
    .filter((r) => r.tier > 0 || r.num >= 2 || r.aim)
    .sort((a, b) => b.score - a.score || a.peopleNeeded - b.peopleNeeded || b.tier - a.tier)
    .slice(0, 6);
}
