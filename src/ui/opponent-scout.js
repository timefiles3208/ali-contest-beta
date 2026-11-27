import { recognizeOpponentLabels, recognizeOpponentTraitStrip, warmScoutOcr } from '../adapters/local-ocr.js?v=augment-speed';
import { augmentIconElement, readCroppedAugmentIcon, readSelectedAugmentIcons, warmOpponentAugmentIcons } from '../adapters/selected-augment-icons.js';
import { contentFrame } from '../adapters/game-frame.js';
import { opponentEconomy, predictOpponentRoutes, scoutEquipmentOptions } from '../engine/opponent-scout.js?v=scout-hold-evidence';
import { withinRecognitionBudget } from '../engine/recognition-budget.js';

const SCOUT_BUDGET_MS = 5_000;
const ROUTE_CONFIDENCE = { strong: '强线索', likely: '较可能', tentative: '待观察' };
const ECONOMY_NAMES = { low: '偏低', normal: '一般', high: '较高' };

export function bindOpponentScout({ view, capture, photo, iconPhoto, heldUnit, copies, economy, augment, artifact, artifactHolder, removeArtifact, saveProfile, clear, clearAll, status, summary, getContext, getFrame, hasSharedStream, onChange, onViewChange }) {
  const pending = new Map();
  let liveQueue = Promise.resolve();
  let listedAugments;
  let listedUnits, listedPatch, listedItems, listedSourceItems;
  let artifactsById = new Map();
  const signal = text => { status.textContent = text; };
  const copiesEntered = () => heldUnit.value && copies.value !== '' && copies.validity.valid;

  function render() {
    const context = getContext();
    const slot = view.value;
    const available = Boolean(context?.comps.length && slot);
    capture.disabled = photo.disabled = economy.disabled = augment.disabled = heldUnit.disabled = !available;
    copies.disabled = !available || !heldUnit.value;
    iconPhoto.disabled = !available || context?.setData.set !== 18;
    if (listedAugments !== context?.augments) {
      listedAugments = context?.augments;
      const entries = [...(listedAugments || [])].sort((a, b) => a.name.localeCompare(b.name, 'zh'));
      augment.replaceChildren(new Option('沿用记录', ''), ...entries.map(row => new Option(row.name, row.id)));
    }
    if (listedPatch !== context?.patch || listedItems !== context?.itemsData || listedSourceItems !== context?.sourceItems) {
      listedPatch = context?.patch;
      listedSourceItems = context?.sourceItems;
      listedItems = context?.itemsData;
      const entries = scoutEquipmentOptions(listedPatch, listedItems, listedSourceItems)
        .sort((a, b) => a.name.localeCompare(b.name, 'zh'));
      artifactsById = new Map(entries.map(row => [row.id, row]));
      artifact.replaceChildren(new Option('选择已确认的装备', ''), ...entries.map(row => new Option(row.name, row.id)));
      artifactHolder.value = '';
    }
    if (listedUnits !== context?.setData.units) {
      listedUnits = context?.setData.units;
      const units = [...(listedUnits || [])].sort((a, b) => a.name.localeCompare(b.name, 'zh'));
      heldUnit.replaceChildren(new Option('选择棋子', ''), ...units.map(unit => new Option(unit.name, unit.id)));
      copies.value = '';
      copies.disabled = true;
      artifactHolder.replaceChildren(new Option('佩戴者未知', ''), ...units.map(unit => new Option(unit.name, unit.id)));
    }
    artifact.disabled = !available || !artifactsById.size;
    artifactHolder.disabled = artifact.disabled || !artifact.value;
    removeArtifact.disabled = artifactHolder.disabled || !context.boards.get(slot)?.artifacts?.some(item => item.id === artifact.value);
    saveProfile.disabled = !available || (!economy.value && !augment.value && !artifact.value && !copiesEntered());
    clear.disabled = !available || (!context.boards.has(slot) && !pending.has(slot));
    clearAll.disabled = !context?.boards.size && !pending.size;
    const names = new Map([...(context?.setData.units || []), ...(context?.setData.traits || [])].map(row => [row.id, row.name]));
    const augmentsById = new Map((context?.augments || []).map(row => [row.id, row.name]));
    const records = [...(context?.boards || [])].sort(([a], [b]) => Number(a) - Number(b));
    summary.replaceChildren(...records.map(([number, { units, traits, routes, gold, economy, augmentIds, artifacts = [], unitCopies = new Map() }]) => {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = '对手 ' + number;
      const detail = document.createElement('span');
      const observed = [...units, ...traits].map(id => names.get(id)).filter(Boolean);
      const econ = ECONOMY_NAMES[economy || opponentEconomy(gold)];
      const goldText = gold != null ? `${gold} 金币（${econ}）` : econ ? `经济预估${econ}` : '金币未知';
      const confirmed = [...unitCopies].map(([id, count]) => names.get(id) + '×' + count);
      const augments = augmentIds.map(id => augmentsById.get(id)).filter(Boolean);
      detail.textContent = ` · 棋子和羁绊 ${observed.join('、') || '未知'} · ${goldText} · 已选海克斯 ${augments.join('、') || '未知'}`;
      if (confirmed.length) detail.textContent += ' · 已确认张数 ' + confirmed.join('、');
      item.append(title, detail, ...augmentIds.map(augmentIconElement).filter(Boolean));
      for (const record of artifacts) {
        const artifact = artifactsById.get(record.id);
        if (!artifact) continue;
        const badge = document.createElement('span');
        badge.className = 'artifact-choice';
        if (artifact.icon) {
          const icon = new Image(22, 22);
          icon.src = artifact.icon;
          icon.alt = '';
          icon.loading = 'lazy';
          badge.append(icon);
        }
        badge.append(`${artifact.name}（${names.get(record.unit) || '佩戴者未知'}）`);
        item.append(badge);
      }
      if (routes.length) {
        const list = document.createElement('ol');
        for (const { comp, confidence, reasons } of routes) {
          const route = document.createElement('li');
          route.textContent = [comp.name, ROUTE_CONFIDENCE[confidence], ...reasons].join(' · ');
          list.append(route);
        }
        item.append(list);
      } else {
        const empty = document.createElement('p');
        empty.textContent = '留牌、羁绊或已选海克斯的线索不足，暂不推断阵容。';
        item.append(empty);
      }
      return item;
    }));
    summary.hidden = !records.length;
  }

  function routesFor(observation, context) {
    const chosen = new Set(observation.augmentIds);
    const augments = context.augments.filter(row => chosen.has(row.id));
    return predictOpponentRoutes(context.comps, { ...observation, augments }, context.patch, context);
  }

  function refreshRoutes() {
    const context = getContext();
    if (!context) return;
    for (const [slot, observation] of context.boards) {
      context.boards.set(slot, { ...observation, routes: routesFor(observation, context) });
    }
  }

  function save(slot, observation, context) {
    const previous = context.boards.get(slot);
    const artifacts = observation.artifacts ?? previous?.artifacts ?? [];
    const unitCopies = observation.unitCopies ?? previous?.unitCopies ?? new Map();
    const routes = routesFor({ ...observation, artifacts, unitCopies }, getContext() ?? context);
    onChange(slot, { ...observation, artifacts, unitCopies, routes });
    return routes;
  }

  async function read(input, live = false) {
    const slot = view.value;
    const context = getContext();
    if (!slot || !context?.comps.length) return;
    const job = {};
    pending.set(slot, job);
    const isLatest = () => pending.get(slot) === job;
    const report = message => { if (view.value === slot) signal(message); };
    report('正在分析对手 ' + slot + '…');
    render();
    try {
      const captured = live ? await getFrame(slot) : null;
      if (!isLatest()) return;
      if (live && !captured) {
        report('未收到可区分的新画面。请先切到该对手，再点重新读取。'
          + (context.boards.has(slot) ? '已保留上一次记录。' : ''));
        return;
      }
      if (captured) report(`已截取对手 ${slot} 的画面，正在分析，可切下一家。`);
      let partial, visualIds = [];
      const includeIcons = (textEvidence) => textEvidence?.augmentIds.length || !visualIds.length ? textEvidence : {
        units: [], traits: [], gold: null, ...textEvidence, augmentIds: visualIds,
      };
      const analyze = () => withinRecognitionBudget(async current => {
        if (!isLatest()) return null;
        const image = live ? captured.canvas : await input();
        if (!image) return null;
        try {
          if (!current() || !isLatest()) return null;
          let canvas = image;
          if (!image.getContext) {
            canvas = document.createElement('canvas');
            const scale = Math.min(1, 1920 / Math.max(image.width, image.height));
            canvas.width = Math.max(1, Math.round(image.width * scale));
            canvas.height = Math.max(1, Math.round(image.height * scale));
            canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
          }
          const active = () => current() && isLatest();
          const icons = context.setData.set === 18 ? readSelectedAugmentIcons(contentFrame(canvas), context.augments, active)
            .then(ids => { if (active()) visualIds = ids; }).catch(() => {}) : Promise.resolve();
          const desktop = canvas.width / canvas.height >= 1.65 && canvas.width / canvas.height <= 1.95;
          const traits = desktop ? await recognizeOpponentTraitStrip(canvas, context.setData, active, [], 0, true)
            .catch(() => []) : [];
          const merge = evidence => ({
            units: [], gold: null, augmentIds: [], ...evidence,
            traits: [...new Set([...traits, ...(evidence?.traits || [])])],
          });
          if (traits.length && active()) partial = merge(null);
          let failure;
          const text = await recognizeOpponentLabels(canvas, context.setData, active, context.augments,
            evidence => { partial = merge(evidence); }).catch(error => { failure = error; return null; });
          await icons;
          if (failure && !visualIds.length && !partial) throw failure;
          const evidence = includeIcons(text ? merge(text) : partial);
          if (desktop || !active() || (evidence && evidence.units.length + evidence.traits.length >= 2)) return evidence;

          const extra = await recognizeOpponentTraitStrip(canvas, context.setData, active,
            evidence?.traits, evidence?.units.length).catch(() => []);
          if (!extra.length || !active()) return evidence;
          traits.push(...extra);
          return merge(evidence);
        } finally {
          image.close?.();
        }
      }, SCOUT_BUDGET_MS);
      const work = live ? liveQueue.then(analyze) : analyze();
      if (live) liveQueue = work.catch(() => {});
      const result = await work;
      if (!isLatest()) return;
      const evidence = result.value || includeIcons(partial);
      const previous = context.boards.get(slot);
      const boardCount = evidence ? evidence.units.length + evidence.traits.length : 0;
      const hasProfile = previous?.augmentIds.length || previous?.artifacts?.length || previous?.unitCopies?.size;
      if (evidence && (boardCount >= 2 || evidence.gold != null || evidence.augmentIds.length || (boardCount && hasProfile))) {
        const routes = save(slot, {
          units: boardCount ? evidence.units : previous?.units || [],
          traits: boardCount ? evidence.traits : previous?.traits || [],
          gold: evidence.gold,
          economy: evidence.gold == null ? previous?.economy : '',
          augmentIds: evidence.augmentIds.length ? evidence.augmentIds : previous?.augmentIds || [],
        }, context);
        report(routes.length ? '已更新对手 ' + slot + ' 的可能阵容。' : '已记录可读信息，阵容方向待确认。');
      } else {
        const message = result.timedOut ? '本次识别已到等待上限。' : '本次可辨认的棋子或羁绊不足。';
        report(message + (context.boards.has(slot) ? '已保留上一次记录。' : '可换一张带有棋子名称或羁绊文字的截图。'));
      }
    } catch {
      if (isLatest()) report('无法读取该画面，请重试或导入截图。');
    } finally {
      if (isLatest()) {
        pending.delete(slot);
        render();
      }
    }
  }

  function readCurrent() {
    if (!hasSharedStream()) {
      void warmScoutOcr().catch(() => {});
      if (getContext()?.setData.set === 18) void warmOpponentAugmentIcons();
      signal('可共享游戏窗口，或导入该对手的截图。');
      return;
    }
    void read(null, true);
  }

  view.onchange = () => {
    heldUnit.value = copies.value = economy.value = augment.value = artifact.value = artifactHolder.value = '';
    onViewChange();
    render();
    if (view.value) {
      if (getContext()?.setData.set === 18) void warmOpponentAugmentIcons();
      readCurrent();
    }
    else signal('当前是我的视角。');
  };
  economy.onchange = augment.onchange = render;
  copies.oninput = () => {
    saveProfile.disabled = !economy.value && !augment.value && !artifact.value && !copiesEntered();
  };
  heldUnit.onchange = () => {
    copies.value = getContext()?.boards.get(view.value)?.unitCopies?.get(heldUnit.value) ?? '';
    render();
  };
  artifact.onchange = () => {
    const saved = getContext()?.boards.get(view.value)?.artifacts?.find(item => item.id === artifact.value);
    artifactHolder.value = saved?.unit || '';
    render();
  };
  saveProfile.onclick = () => {
    const slot = view.value;
    const context = getContext();
    if (!slot || !context || saveProfile.disabled) return;
    pending.delete(slot);
    const previous = context.boards.get(slot);
    if (heldUnit.value && copies.value && !copies.reportValidity()) return;
    const artifacts = previous?.artifacts || [];
    const unitCopies = new Map(previous?.unitCopies);
    if (copiesEntered()) {
      if (copies.valueAsNumber) unitCopies.set(heldUnit.value, copies.valueAsNumber);
      else unitCopies.delete(heldUnit.value);
    }
    save(slot, {
      unitCopies,
      units: previous?.units || [],
      traits: previous?.traits || [],
      gold: economy.value ? null : previous?.gold ?? null,
      economy: economy.value || previous?.economy || '',
      augmentIds: augment.value ? [augment.value] : previous?.augmentIds || [],
      artifacts: artifact.value ? [
        ...artifacts.filter(item => item.id !== artifact.value),
        { id: artifact.value, unit: artifactHolder.value },
      ] : artifacts,
    }, context);
    heldUnit.value = copies.value = economy.value = augment.value = artifact.value = artifactHolder.value = '';
    signal('已更新对手 ' + slot + ' 的补充信息。');
    render();
  };
  removeArtifact.onclick = () => {
    const slot = view.value;
    const context = getContext();
    const previous = context?.boards.get(slot);
    if (!previous || removeArtifact.disabled) return;
    save(slot, { ...previous, artifacts: previous.artifacts.filter(item => item.id !== artifact.value) }, context);
    artifact.value = artifactHolder.value = '';
    signal('已移除对手 ' + slot + ' 的装备记录。');
    render();
  };
  capture.onclick = readCurrent;
  photo.onchange = () => {
    const file = photo.files[0];
    photo.value = '';
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { signal('请选择 20 MB 以内的截图。'); return; }
    void read(() => createImageBitmap(file));
  };
  iconPhoto.onchange = async () => {
    const [file] = iconPhoto.files;
    iconPhoto.value = '';
    const slot = view.value;
    const context = getContext();
    if (!file || !slot || context?.setData.set !== 18 || !context.comps.length) return;
    if (file.size > 5 * 1024 * 1024) { signal('请选择 5 MB 以内的单枚海克斯图标。'); return; }
    const job = {};
    pending.set(slot, job);
    const report = message => { if (view.value === slot) signal(message); };
    report('正在匹配已选海克斯图标…');
    render();
    try {
      const result = await withinRecognitionBudget(() => readCroppedAugmentIcon(file, context.augments), SCOUT_BUDGET_MS);
      if (pending.get(slot) !== job) return;
      if (!result.value) {
        report(result.timedOut ? '图标识别已到等待上限。' : '图标匹配不明确，请裁出一枚完整图标，或手动补充名称。');
        return;
      }
      const previous = context.boards.get(slot);
      save(slot, {
        units: previous?.units || [], traits: previous?.traits || [],
        gold: previous?.gold ?? null, economy: previous?.economy || '',
        augmentIds: [...new Set([...(previous?.augmentIds || []), result.value])].slice(0, 3),
      }, context);
      report(`已登记对手 ${slot} 的 ${context.augments.find(row => row.id === result.value)?.name}。`);
    } catch {
      if (pending.get(slot) === job) report('无法读取该图标，试试 PNG、JPG 或 WebP。');
    } finally {
      if (pending.get(slot) === job) {
        pending.delete(slot);
        render();
      }
    }
  };
  clear.onclick = () => {
    pending.delete(view.value);
    onChange(view.value, null);
    signal('已清除该对手的记录。');
    render();
  };
  clearAll.onclick = () => {
    pending.clear();
    onChange(null, null);
    signal('已清空本局对手记录。');
    render();
  };
  return {
    render,
    refreshRoutes,
    reset() {
      pending.clear();
      view.value = heldUnit.value = copies.value = economy.value = augment.value = artifact.value = artifactHolder.value = '';
      signal('当前是我的视角。');
      render();
    },
  };
}
