// 推荐引擎：纯函数，输入「已选棋子」输出「按成型可能性打分的阵容」。
// 只依赖本地数据(卡池 + 阵容库)，不需要任何网络，因此可静态发布。

const norm = (v) => Math.max(0, Math.min(1, v || 0));

export function buildUnitIndex(setData) {
  const byId = new Map();
  for (const u of setData.units) byId.set(u.id, u);
  const traitNames = new Map((setData.traits || []).map((t) => [t.id, t.name]));
  const traitTiers = new Map((setData.traits || []).map((t) => [t.id, t.tiers || []]));
  return { byId, traitNames, traitTiers };
}

// 羁绊按「人数区间」给档，人数并不等于层数：例如约德尔 3/5/7 档，6 人只落在 5 档。
export function tierFor(num, tiers) {
  let tier = 0;
  for (const t of tiers || []) if (num >= t.min && t.min > tier) tier = t.min;
  return tier;
}

// 阵容内部件的持有率，以及核心件命中率。核心件为 0 命中时该阵容判为不可成型。
function overlap(list, selected) {
  const hit = list.filter((id) => selected.has(id));
  return { hit, missing: list.filter((id) => !selected.has(id)), ratio: list.length ? hit.length / list.length : 1 };
}

// 用已选中的阵容内单位模拟上场，统计羁绊层数（取前 level 个高性价比单位）。
export function simulateTraits(compUnits, index, level) {
  const pool = [...compUnits].sort((a, b) => {
    const ua = index.byId.get(a);
    const ub = index.byId.get(b);
    return (ua?.cost || 9) - (ub?.cost || 9);
  });
  const fielded = pool.slice(0, level);
  const counts = new Map();
  for (const id of fielded) {
    for (const t of index.byId.get(id)?.traits || []) {
      counts.set(t, (counts.get(t) || 0) + 1);
    }
  }
  return { fielded, counts };
}

export function recommend({ setData, comps, selected, level = 7, weights }) {
  const w = { core: 0.45, coverage: 0.3, strength: 0.25, ...weights };
  const index = buildUnitIndex(setData);
  const sel = selected instanceof Set ? selected : new Set(selected);

  const scored = comps.map((comp) => {
    const core = overlap(comp.core?.length ? comp.core : comp.units, sel);
    const full = overlap(comp.units, sel);
    const ownedOutside = [...sel].filter((id) => !comp.units.includes(id) && index.byId.has(id));
    // 核心件一个都没摸到 → 这套只能当转型参考，不给成型分。
    const viable = core.hit.length > 0;
    const levelGap = Math.max(0, (comp.level || level) - level);
    const penalty = levelGap * 0.05 + (viable ? 0 : 0.35);
    const raw = norm(w.core * core.ratio + w.coverage * full.ratio + w.strength * norm(comp.strength));
    const { fielded, counts } = simulateTraits(full.hit, index, level);
    const traits = [...counts.entries()]
      .map(([id, num]) => ({
        id,
        name: index.traitNames.get(id) || id,
        num,
        tier: tierFor(num, index.traitTiers.get(id)),
        aim: (comp.aimTraits || {})[id] || null,
      }))
      .sort((a, b) => b.tier - a.tier || b.num - a.num);

    return {
      comp,
      score: Math.round(Math.max(0, raw - penalty) * 100),
      viable,
      detail: {
        coreHit: core.hit.map((id) => index.byId.get(id)?.name).filter(Boolean),
        coreMissing: core.missing.map((id) => index.byId.get(id)?.name).filter(Boolean),
        missing: full.missing.map((id) => ({ ...index.byId.get(id) })),
        fieldedCount: fielded.length,
        ownedOutside: ownedOutside.map((id) => index.byId.get(id)?.name).filter(Boolean),
        levelGap,
      },
      simulatedTraits: traits,
    };
  });

  return scored.sort((a, b) => b.score - a.score || b.viable - a.viable);
}

// 反向模式：不给阵容，只看这批棋子现在能自然凑出哪些羁绊层数。
export function traitBreakdown(setData, selected) {
  const index = buildUnitIndex(setData);
  const counts = new Map();
  for (const id of selected instanceof Set ? selected : new Set(selected)) {
    for (const t of index.byId.get(id)?.traits || []) counts.set(t, (counts.get(t) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, num]) => ({ id, name: index.traitNames.get(id) || id, num, tier: tierFor(num, index.traitTiers.get(id)) }))
    .sort((a, b) => b.tier - a.tier || b.num - a.num);
}
