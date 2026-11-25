import { renderLineupList } from './lineup-list.js?v=selected-augment-icons';
import { rankOpeningAugments } from '../engine/opening.js?v=selected-augment-icons';
import { AUGMENT_TIER_LABELS, augmentTier, inferAugmentTier } from '../data/augment-tiers.js';

export function bindOpeningAdvice({ dialog, open, city, economy, item, addItem, removeItem, unitSelect, toggleUnit, ownedSummary, candidates, inputs, list, tier, tierStatus, direction, picks, getContext, onChange, onPick, onTier }) {
  let detectedUnits = [];
  let catalogIdentity;
  let picksKey;
  let listTier;

  function options(select, entries, label) {
    const previous = select.value;
    select.replaceChildren(new Option(label, ''), ...entries.map(({ id, name }) => new Option(name, id)));
    select.value = entries.some(row => row.id === previous) ? previous : '';
  }

  function reset() {
    if (dialog.open) dialog.close();
    detectedUnits = [];
    city.value = economy.value = item.value = unitSelect.value = '';
    tier.value = '';
    inputs.forEach(input => { input.value = ''; });
    catalogIdentity = null;
  }

  function draw() {
    const ctx = getContext();
    open.disabled = !ctx?.comps.length;
    if (!ctx || !dialog.open) return;
    const { setData, itemsData, selected, owned, ownedItems, cities, augments, ranked } = ctx;
    if (catalogIdentity !== setData) {
      catalogIdentity = setData;
      options(city, cities, '未确认');
      options(item, [
        ...(itemsData?.components || []).map(row => ({ ...row, name: `${row.name} · 散件` })),
        ...(itemsData?.items || []),
      ], '选择散件或成装');
      options(unitSelect, setData.units, '选择棋子');
      listTier = undefined;
    }
    city.value = ctx.city?.id || '';
    economy.value = ctx.economy || '';
    const chosenTier = tier.value || ctx.city?.firstAugmentTier;
    const offered = offeredIds(augments, chosenTier);
    const inferred = inferAugmentTier(offered);
    const effective = chosenTier || inferred;
    const tierSource = tier.value ? '手动选择' : ctx.city?.firstAugmentTier
      ? `由「${ctx.city.name}」城邦确定` : '根据候选名称识别';
    const mismatch = offered.some(id => augmentTier(id) !== effective);
    const available = effective ? offered.filter(id => augmentTier(id) === effective) : [];
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
    const itemNames = (itemsData?.items || []).filter(row => ownedItems.has(row.id)).map(row => row.name);
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
      emptyHint: '选择城邦、确认当前持有的棋子或登记装备。',
    });
    const chosen = rankOpeningAugments({
      setData, augments, ranked, selected, owned, ownedItems, itemsData,
      offered: available, tier: effective, city: ctx.city, economy: ctx.economy,
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

  function show() {
    if (open.disabled) return;
    if (!dialog.open) dialog.showModal();
    draw();
  }

  function receive({ units, opening }) {
    const ctx = getContext();
    if (!ctx) return;
    if (units.length || dialog.open) detectedUnits = units;
    const cities = opening?.cities || [];
    if (!ctx.city && cities.length === 1) onChange({ city: cities[0] });
    const slots = opening?.offeredSlots;
    if (slots) {
      slots.forEach((id, i) => {
        const name = ctx.augments.find(row => row.id === id)?.name;
        if (name && inputs[i] && !inputs[i].value && !inputs.some(input => input.value === name)) inputs[i].value = name;
      });
    } else {
      const offered = (opening?.offered || []).map(id => ctx.augments.find(row => row.id === id)?.name).filter(Boolean);
      if (offered.length && offered.length <= 3 && inputs.every(input => !input.value)) {
        offered.forEach((name, i) => { inputs[i].value = name; });
      }
    }
    draw();
  }

  open.onclick = show;
  city.onchange = () => onChange({ city: city.value });
  economy.onchange = () => onChange({ economy: economy.value });
  addItem.onclick = () => { if (item.value) onChange({ item: item.value, delta: 1 }); };
  removeItem.onclick = () => { if (item.value) onChange({ item: item.value, delta: -1 }); };
  toggleUnit.onclick = () => {
    if (unitSelect.value) onChange({ unit: unitSelect.value, selected: !getContext()?.selected.has(unitSelect.value) });
  };
  inputs.forEach(input => { input.oninput = draw; });
  tier.onchange = draw;
  return { draw, show, receive, reset };
}
