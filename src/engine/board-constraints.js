export function solveBoardConstraints(comps, setData, options) {
  const { include, exclude, excludeCost, trait, tier, maxTier, maxLevel, emblem, bearer } = options;
  const units = new Map(setData.units.map(unit => [unit.id, unit]));
  const emblemName = setData.traits?.find(entry => entry.id === emblem)?.name || emblem;
  const legal = id => id !== exclude && (!excludeCost || units.get(id)?.cost !== excludeCost);
  function evaluate(ids) {
    if (include && !ids.includes(include) || !ids.every(legal)) return null;
    const carrier = emblem && (bearer || ids.find(id => !units.get(id)?.traits?.includes(emblem)));
    if (emblem && (!carrier || !ids.includes(carrier) || units.get(carrier)?.traits?.includes(emblem))) return null;
    const counts = {};
    for (const id of ids) {
      for (const key of units.get(id)?.traits || []) counts[key] = (counts[key] || 0) + 1;
    }
    if (carrier) counts[emblem] = (counts[emblem] || 0) + 1;
    const count = counts[trait] || 0;
    if (trait && (count < (tier || 1) || maxTier && count > maxTier)) return null;
    return { counts, carrier };
  }
  const seeds = comps.filter(comp => !maxLevel || comp.level <= maxLevel);
  function withEmblem(comp, result) {
    if (!result.carrier) return comp;
    return { ...comp, aimTraits: { ...comp.aimTraits, [emblem]: result.counts[emblem] },
      plannedEmblem: { trait: emblem, name: emblemName, unit: result.carrier, bearer: units.get(result.carrier)?.name || result.carrier } };
  }
  const exact = seeds.flatMap(comp => {
    const result = evaluate(comp.units);
    return result ? [withEmblem(comp, result)] : [];
  });
  if (exact.length) return { comps: exact, generated: false };

  const alternate = [];
  const seen = new Set();
  for (const base of seeds) {
    const candidates = include && !base.units.includes(include) ? [include]
      : bearer && emblem && !base.units.includes(bearer) ? [bearer] : [...units.keys()];
    for (const id of candidates) {
      if (!legal(id) || base.units.includes(id)) continue;
      for (const out of base.units) {
        if (base.core?.includes(out) && legal(out)) continue;
        const ids = base.units.map(existing => existing === out ? id : existing);
        const key = [...ids].sort().join('|');
        if (seen.has(key)) continue;
        const result = evaluate(ids);
        if (!result) continue;
        seen.add(key);
        const keep = object => Object.fromEntries(Object.entries(object || {}).filter(([unit]) => ids.includes(unit)));
        alternate.push(withEmblem({
          id: 'variant-' + key, name: `${base.name} · 调整方案`, units: ids, level: base.level,
          core: (base.core || []).filter(unit => ids.includes(unit)), carry: (base.carry || []).filter(unit => ids.includes(unit)),
          items: keep(base.items), itemBuilds: keep(base.itemBuilds), stars: keep(base.stars),
          aimTraits: result.counts, traits: Object.keys(result.counts), strength: 0,
        }, result));
        if (alternate.length === 16) return { comps: alternate, generated: true };
      }
    }
  }
  return { comps: alternate, generated: Boolean(alternate.length) };
}
