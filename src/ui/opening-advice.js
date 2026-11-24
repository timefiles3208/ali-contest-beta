import { rankOpeningAugments } from '../engine/opening.js?v=augment-tier';
import { AUGMENT_TIER_LABELS, augmentTier, inferAugmentTier } from '../data/augment-tiers.js';

export function bindOpeningAdvice({ dialog, open, city, economy, item, addItem, ownedSummary, candidates, inputs, list, tier, tierStatus, direction, picks, getContext, onChange, onPick, onTier }) {
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
    city.value = economy.value = item.value = '';
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
      options(item, itemsData?.items || [], '选择成装');
      listTier = undefined;
    }
    city.value = ctx.city?.id || '';
    economy.value = ctx.economy || '';
    const offered = offeredIds(augments);
    const inferred = inferAugmentTier(offered);
    const effective = tier.value || inferred;
    const mismatch = offered.some(id => augmentTier(id) !== effective);
    const available = effective ? offered.filter(id => augmentTier(id) === effective) : [];
    if (effective !== listTier) {
      const names = augments.filter(aug => !effective || augmentTier(aug.id) === effective).map(aug => aug.name);
      list.replaceChildren(...[...new Set(names)].map(name => new Option(name, name)));
      listTier = effective;
    }
    onTier(effective || '');
    tierStatus.textContent = effective
      ? `${AUGMENT_TIER_LABELS[effective]}${tier.value ? ' · 手动选择' : ' · 根据候选名称识别'}${mismatch ? '。其余档位的候选已排除。' : '。'}`
      : offered.length ? '候选档位不一致，请核对名称或手动选择当轮颜色。'
        : '填入本轮选项后可判断颜色，也可以手动选择。';
    const effects = cities.find(row => row.id === city.value);
    const weight = ranked.find(row => row.viable);
    const description = effects?.description ? ` · ${effects.description}` : '';
    const parts = [...owned.values()].reduce((sum, count) => sum + count, 0);
    const itemNames = [...ownedItems].map(id => itemsData?.items.find(row => row.id === id)?.name).filter(Boolean);
    ownedSummary.textContent = `已确认 ${selected.size} 名棋子 · ${parts} 件散件${itemNames.length ? ' · ' + itemNames.join('、') : ''}${description}`;
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
    const outcome = weight?.comp;
    const headline = outcome ? `${outcome.name} · ${outcome.level} 人口` : '先确认开局信息';
    const title = document.createElement('strong');
    title.textContent = headline;
    const evidence = document.createElement('p');
    evidence.className = 'fine';
    evidence.textContent = outcome
      ? [...weight.reasons, outcome.rank?.tier && `榜单 ${outcome.rank.tier} 级`].filter(Boolean).join(' · ') || '当前按数据站强度排序。'
      : '选择城邦、确认当前持有的棋子或登记装备。';
    direction.replaceChildren(title, evidence);

    const chosen = rankOpeningAugments({ setData, augments, ranked, selected, offered: available, tier: effective });
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

  function offeredIds(augments) {
    return inputs.flatMap(input => {
      const matches = augments.filter(row => row.name === input.value.trim());
      const preferred = tier.value ? matches.filter(row => augmentTier(row.id) === tier.value) : matches;
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
  addItem.onclick = () => { if (item.value) onChange({ item: item.value }); };
  inputs.forEach(input => { input.oninput = draw; });
  tier.onchange = draw;
  return { draw, show, receive, reset };
}
