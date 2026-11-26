export function openingUnitDirection({ ranked = [], selected, unitCopies }, prompted) {
  if (!selected.size) return null;
  for (const row of ranked) {
    if (!row.viable || row.planning || !row.formation) continue;
    const supportingCore = row.comp.core?.filter(id => selected.has(id)).length ?? 0;
    const unit = row.formation.carries.find(carry => selected.has(carry.id) && !prompted.has(carry.id)
      && (carry.cost >= 3 || (carry.stars >= 3 && (unitCopies.get(carry.id) ?? 1) >= 3)
        || (row.comp.core?.includes(carry.id) && (supportingCore >= 2 || row.gearPoints >= 5))));
    if (unit) return { row, unit };
  }
  return null;
}
