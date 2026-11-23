// 成装规划：以「库里的推荐件」为目标，把手上的散件按顺序贪心地分配下去，
// 分配不动的就明确说缺哪个散件，而不是假装还能合成。
export function planItems({ setData, itemsData, comp, owned = new Map(), ownedItems = new Set(), limit = 3 }) {
  if (!itemsData?.items?.length || !comp) return { rows: [], spare: [] };
  const itemById = new Map(itemsData.items.map((i) => [i.id, i]));
  const compById = new Map(itemsData.components.map((c) => [c.id, c]));
  const unitById = new Map(setData.units.map((u) => [u.id, u]));
  const recMap = comp.items || {};

  const pool = new Map();
  for (const [id, n] of owned) if (n > 0) pool.set(id, n);

  const roleOf = (id) => (comp.carry?.includes(id) ? '主C' : comp.tank?.includes(id) ? '前排' : comp.core?.includes(id) ? '核心' : '挂件');
  const order = [...(comp.carry || []), ...(comp.tank || []), ...comp.units].filter((id, i, a) => a.indexOf(id) === i);

  const build = (itemId) => {
    const item = itemById.get(itemId);
    if (!item) return null;
    const tally = new Map();
    for (const c of item.from) tally.set(c, (tally.get(c) || 0) + 1);
    const need = [];
    for (const [c, n] of tally) {
      const have = pool.get(c) || 0;
      if (have < n) need.push(...Array.from({ length: n - have }, () => c));
    }
    // 只有真的凑得齐才从散件池里扣，否则一件大剑会被三套「做不出来」的推荐吃光。
    if (!need.length) for (const [c, n] of tally) pool.set(c, (pool.get(c) || 0) - n);
    return {
      item,
      from: item.from.map((id) => compById.get(id)).filter(Boolean),
      need: [...new Set(need)].map((id) => compById.get(id)).filter(Boolean),
      state: ownedItems.has(item.id) ? 'done' : need.length ? 'lack' : 'ready',
    };
  };

  const rows = [];
  for (const unitId of order) {
    const ids = recMap[unitId] || [];
    if (!ids.length) continue;
    const unit = unitById.get(unitId);
    if (!unit) continue;
    const recs = ids.slice(0, limit).map(build).filter(Boolean);
    if (recs.length) rows.push({ unit, unitId, role: roleOf(unitId), recs });
    if (rows.length >= 4) break;
  }

  // 散件还有剩 → 顺手能做的通用成装，避免玩家手里堆一坨做不出东西的组件。
  const recIds = new Set(rows.flatMap((r) => r.recs.map((x) => x.item.id)));
  const canMake = (item) => {
    const t = new Map();
    for (const c of item.from) t.set(c, (t.get(c) || 0) + 1);
    return [...t.entries()].every(([c, n]) => (pool.get(c) || 0) >= n);
  };
  const spare = itemsData.items
    .filter((i) => !recIds.has(i.id) && i.kind === 'completed' && canMake(i))
    .slice(0, 4)
    .map((item) => ({ item }));

  return { rows, spare, poolLeft: [...pool.entries()].filter(([, n]) => n > 0) };
}
