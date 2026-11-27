import { renderLineupList } from './lineup-list.js?v=scout-direction';
import { rankOpeningAugments } from '../engine/opening.js?v=scout-direction';
import { AUGMENT_TIER_LABELS, augmentTier, inferAugmentTier } from '../data/augment-tiers.js';
import { artifactOptions, radiantOptions } from '../engine/artifacts.js?v=game-release-scope';

export function bindOpeningAdvice({ dialog, open, city, economy, item, addItem, removeItem, unitSelect, toggleUnit, ownedSummary, candidates, inputs, list, tier, tierStatus, direction, picks, opponentCoverage, rollFields, rollLevel, rollGold, rollXp, copies, hud, applyHud, getContext, onChange, onPick, onTier, onShow, onChoices, onSelect }) {
  let detectedUnits = [];
  let detectedShop;
  let catalogIdentity;
  let openingEquipment = [];
  let picksKey;
  let listTier;
  let previewing = false;
  let detectedSlots = [];
  const editedSlots = new Set();

  function options(select, entries, label) {
    const previous = select.value;
    select.replaceChildren(new Option(label, ''), ...entries.map(({ id, name }) => new Option(name, id)));
    select.value = entries.some(row => row.id === previous) ? previous : '';
  }

  function reset() {
    if (dialog.open) dialog.close();
    detectedUnits = [];
    detectedShop = null;
    previewing = false;
    detectedSlots = [];
    editedSlots.clear();
    city.value = economy.value = item.value = unitSelect.value = '';
    tier.value = '';
    inputs.forEach(input => { input.value = ''; });
    catalogIdentity = null;
  }

  function draw() {
    const ctx = getContext();
    open.disabled = !ctx?.comps.length;
    if (!ctx || (!dialog.open && !previewing)) return;
    const { setData, itemsData, selected, owned, ownedItems, cities, augments, ranked } = ctx;
    const chosenTier = tier.value || ctx.city?.firstAugmentTier;
    const offered = offeredIds(augments, chosenTier);
    const effective = chosenTier || inferAugmentTier(offered);
    const available = effective ? offered.filter(id => augmentTier(id) === effective) : [];
    const chosen = rankOpeningAugments({
      setData, augments, ranked: ctx.augmentRanked, selected, owned, ownedItems, itemsData,
      offered: available, tier: effective, city: ctx.city, economy: ctx.economy,
      augmentStats: ctx.board?.augments, patch: ctx.board?.version,
    });
    onChoices(chosen);
    if (!dialog.open) return;
    const observed = ctx.opponentBoards.size;
    opponentCoverage.textContent = `对手已记录 ${observed} 家，${7 - observed} 家未知。2-1 推荐使用已有信息，可直接查看。`;
    if (catalogIdentity !== setData) {
      catalogIdentity = setData;
      options(city, cities, '未确认');
      const patch = ctx.board?.version;
      openingEquipment = itemsData?.source === 'dataj.cc' ? itemsData.items
        : [...(itemsData?.items || []), ...artifactOptions(patch, ctx.sourceItems), ...radiantOptions(patch, itemsData, ctx.sourceItems)];
      options(item, [
        ...(itemsData?.components || []).map(row => ({ ...row, name: `${row.name} · 散件` })),
        ...openingEquipment,
      ], '选择装备');
      options(unitSelect, setData.units, '选择棋子');
      listTier = undefined;
    }
    city.value = ctx.city?.id || '';
    economy.value = ctx.economy || '';
    rollFields.hidden = ctx.sourceId !== 'datatft' || setData.set !== 18 || ctx.board?.version !== '18.7';
    rollLevel.value = ctx.rollBudget.level ?? '';
    rollGold.value = ctx.rollBudget.gold ?? '';
    rollXp.value = ctx.rollBudget.xp ?? '';
    hud.hidden = applyHud.hidden = !detectedShop;
    if (detectedShop) {
      const { level, gold, xp } = detectedShop;
      hud.textContent = [`截图识别 ${level} 级`, `${gold} 金`, xp != null && `经验 ${xp}`].filter(Boolean).join(' · ');
    }
    showCopies(ctx);
    const tierSource = tier.value ? '手动选择' : ctx.city?.firstAugmentTier
      ? `由「${ctx.city.name}」城邦确定` : '根据候选名称识别';
    const mismatch = offered.some(id => augmentTier(id) !== effective);
    if (effective !== listTier) {
      const names = augments.filter(aug => !effective || augmentTier(aug.id) === effective).map(aug => aug.name);
      list.replaceChildren(...[...new Set(names)].map(name => new Option(name, name)));
      listTier = effective;
    }
    onTier(effective || '');
    tierStatus.textContent = effective
      ? `${AUGMENT_TIER_LABELS[effective]} · ${tierSource}${mismatch ? '。其余档位的候选已排除。' : '。'}`
      : offered.length ? '候选档位不一致，请核对名称或手动选择当轮颜色。'
        : '填入本轮选项后可判断颜色，也可以手动选择。';
    const effects = cities.find(row => row.id === city.value);
    const description = effects?.description ? ` · ${effects.description}` : '';
    const unitNames = setData.units.filter(unit => selected.has(unit.id)).map(unit => unit.name);
    const parts = (itemsData?.components || []).filter(row => owned.get(row.id))
      .map(row => `${row.name}×${owned.get(row.id)}`);
    const itemNames = openingEquipment.filter(row => ownedItems.has(row.id)).map(row => row.name);
    ownedSummary.textContent = [
      unitNames.length ? `棋子 ${unitNames.join('、')}` : '尚未登记棋子',
      parts.length && `散件 ${parts.join('、')}`,
      itemNames.length && `成装 ${itemNames.join('、')}`,
    ].filter(Boolean).join(' · ') + description;
    const legend = document.createElement('legend');
    legend.textContent = '识别到的棋子名，勾选仍在手上的棋子';
    const checks = detectedUnits.map(id => setData.units.find(row => row.id === id)).filter(Boolean).map(({ id, name }) => {
      const label = document.createElement('label');
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = selected.has(id);
      check.onchange = () => onChange({ unit: id, selected: check.checked });
      label.append(check, ` ${name}`);
      return label;
    });
    candidates.replaceChildren(legend, ...checks);
    candidates.hidden = !checks.length;
    renderLineupList(direction, ranked, {
      allowUnmatched: true, onSelect, selectedId: ctx.lineupChoice?.id,
    });
    const nextKey = JSON.stringify(chosen.map(({ aug, reasons }) => [aug.id, aug.name, reasons]));
    if (nextKey === picksKey) return;
    picksKey = nextKey;
    picks.replaceChildren(...chosen.map(({ aug, reasons }) => {
      const row = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ghost';
      button.dataset.tier = augmentTier(aug.id);
      button.textContent = `选 ${aug.name}`;
      button.onclick = () => { onPick(aug.id); dialog.close(); };
      const note = document.createElement('span');
      note.className = 'fine';
      note.textContent = reasons.join(' · ');
      row.append(button, note);
      return row;
    }));
  }

  function offeredIds(augments, chosenTier) {
    return inputs.flatMap(input => {
      const matches = augments.filter(row => row.name === input.value.trim());
      const preferred = chosenTier ? matches.filter(row => augmentTier(row.id) === chosenTier) : matches;
      const resolved = preferred.length ? preferred : matches;
      return resolved.length === 1 ? [resolved[0].id] : [];
    });
  }

  function show(stage) {
    if (open.disabled) return;
    if (!dialog.open) dialog.showModal();
    onShow(stage);
    draw();
  }

  function showCopies(ctx) {
    const id = unitSelect.value;
    copies.disabled = !ctx?.selected.has(id);
    copies.value = copies.disabled ? '' : ctx.unitCopies.get(id) ?? 1;
  }

  for (const [key, field] of Object.entries({ level: rollLevel, gold: rollGold, xp: rollXp })) {
    field.onchange = () => {
      if (field.reportValidity()) onChange({ rollBudget: { [key]: field.value === '' ? undefined : field.valueAsNumber } });
    };
  }
  unitSelect.onchange = () => showCopies(getContext());
  applyHud.onclick = () => {
    if (detectedShop) onChange({ rollBudget: { xp: undefined, ...detectedShop } });
  };
  copies.onchange = () => {
    if (copies.reportValidity()) onChange({ unitCopies: { id: unitSelect.value, count: copies.valueAsNumber || 1 } });
  };

  function receive({ units = [], opening, shop }) {
    const ctx = getContext();
    if (!ctx) return;
    if (units.length || opening && dialog.open) detectedUnits = units;
    if (shop) detectedShop = shop;
    const cities = opening?.cities || [];
    if (!ctx.city && cities.length === 1) onChange({ city: cities[0] });
    const slots = opening?.offeredSlots;
    if (slots) {
      const names = slots.map(id => ctx.augments.find(row => row.id === id)?.name);
      if (names.filter(Boolean).length >= detectedSlots.filter(Boolean).length) {
        // Preserve edits while allowing a later, more complete read to correct automatic fields.
        const userValues = inputs.map((input, i) => editedSlots.has(i) ? input.value : '');
        const used = new Set(userValues.filter(Boolean));
        detectedSlots = inputs.map((input, i) => {
          if (editedSlots.has(i)) return null;
          const name = names[i];
          if (!name || used.has(name)) { input.value = ''; return null; }
          used.add(name);
          input.value = name;
          return name;
        });
      }
    } else {
      const offered = (opening?.offered || []).map(id => ctx.augments.find(row => row.id === id)?.name).filter(Boolean);
      if (offered.length && offered.length <= 3 && !editedSlots.size && inputs.every(input => !input.value)) {
        detectedSlots = offered;
        offered.forEach((name, i) => { inputs[i].value = name; });
      }
    }
    draw();
  }

  open.onclick = () => show();
  city.onchange = () => onChange({ city: city.value });
  economy.onchange = () => onChange({ economy: economy.value });
  addItem.onclick = () => { if (item.value) onChange({ item: item.value, delta: 1 }); };
  removeItem.onclick = () => { if (item.value) onChange({ item: item.value, delta: -1 }); };
  toggleUnit.onclick = () => {
    if (unitSelect.value) onChange({ unit: unitSelect.value, selected: !getContext()?.selected.has(unitSelect.value) });
  };
  inputs.forEach((input, i) => { input.oninput = () => { editedSlots.add(i); detectedSlots[i] = null; draw(); }; });
  tier.onchange = draw;
  return {
    draw, show, receive, reset,
    startPreview() { previewing = true; draw(); },
    endPreview() { previewing = false; },
  };
}
