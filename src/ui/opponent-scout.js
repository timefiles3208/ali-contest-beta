import { recognizeOpponentLabels, recognizeOpponentTraitStrip, warmScoutOcr } from '../adapters/local-ocr.js?v=ocr-priority';
import { augmentIconElement, readCroppedAugmentIcon, readSelectedAugmentIcons, warmOpponentAugmentIcons } from '../adapters/selected-augment-icons.js';
import { contentFrame } from '../adapters/game-frame.js';
import { opponentEconomy, predictOpponentRoutes } from '../engine/opponent-scout.js?v=formation-plan';
import { withinRecognitionBudget } from '../engine/recognition-budget.js';

const SCOUT_BUDGET_MS = 5_000;
const ECONOMY_NAMES = { low: '偏低', normal: '一般', high: '较高' };

export function bindOpponentScout({ view, capture, photo, iconPhoto, economy, augment, saveProfile, clear, clearAll, status, summary, getContext, getFrame, hasSharedStream, onChange, onViewChange }) {
  const pending = new Map();
  let liveQueue = Promise.resolve();
  let listedAugments;
  const signal = text => { status.textContent = text; };

  function render() {
    const context = getContext();
    const slot = view.value;
    const available = Boolean(context?.comps.length && slot);
    capture.disabled = photo.disabled = economy.disabled = augment.disabled = !available;
    iconPhoto.disabled = !available || context?.setData.set !== 18;
    if (listedAugments !== context?.augments) {
      listedAugments = context?.augments;
      const entries = [...(listedAugments || [])].sort((a, b) => a.name.localeCompare(b.name, 'zh'));
      augment.replaceChildren(new Option('沿用记录', ''), ...entries.map(row => new Option(row.name, row.id)));
    }
    saveProfile.disabled = !available || (!economy.value && !augment.value);
    clear.disabled = !available || (!context.boards.has(slot) && !pending.has(slot));
    clearAll.disabled = !context?.boards.size && !pending.size;
    const names = new Map([...(context?.setData.units || []), ...(context?.setData.traits || [])].map(row => [row.id, row.name]));
    const augmentsById = new Map((context?.augments || []).map(row => [row.id, row.name]));
    const records = [...(context?.boards || [])].sort(([a], [b]) => Number(a) - Number(b));
    summary.replaceChildren(...records.map(([number, { units, traits, routes, gold, economy, augmentIds }]) => {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = '对手 ' + number;
      const detail = document.createElement('span');
      const observed = [...units, ...traits].map(id => names.get(id)).filter(Boolean);
      const econ = ECONOMY_NAMES[economy || opponentEconomy(gold)];
      const goldText = gold != null ? `${gold} 金币（${econ}）` : econ ? `经济预估${econ}` : '金币未知';
      const augments = augmentIds.map(id => augmentsById.get(id)).filter(Boolean);
      detail.textContent = ` · 棋子和羁绊 ${observed.join('、') || '未知'} · ${goldText} · 已选海克斯 ${augments.join('、') || '未知'}`;
      item.append(title, detail, ...augmentIds.map(augmentIconElement).filter(Boolean));
      if (routes.length) {
        const list = document.createElement('ol');
        for (const { comp } of routes) {
          const route = document.createElement('li');
          route.textContent = comp.name;
          list.append(route);
        }
        item.append(list);
      } else {
        const empty = document.createElement('p');
        empty.textContent = '暂无符合这次画面的阵容方向。';
        item.append(empty);
      }
      return item;
    }));
    summary.hidden = !records.length;
  }

  function save(slot, observation, context) {
    const chosen = new Set(observation.augmentIds);
    const augments = context.augments.filter(row => chosen.has(row.id));
    const routes = predictOpponentRoutes(context.comps, { ...observation, augments }, context.patch, context);
    onChange(slot, { ...observation, routes });
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
          let failure;
          const text = await recognizeOpponentLabels(canvas, context.setData, active, context.augments,
            evidence => { partial = evidence; }).catch(error => { failure = error; return null; });
          await icons;
          if (failure && !visualIds.length && !partial) throw failure;
          const evidence = includeIcons(text || partial);
          if (!live || !active() || view.value !== slot ||
              (evidence && evidence.units.length + evidence.traits.length >= 2)) return evidence;

          const retry = await getFrame(slot, { sameAs: captured.stamp });
          if (!retry || !active() || view.value !== slot) return evidence;
          const traits = await recognizeOpponentTraitStrip(retry.canvas, context.setData, active).catch(() => []);
          if (!traits.length || !active()) return evidence;
          return {
            units: [], gold: null, augmentIds: [], ...evidence,
            traits: [...new Set([...(evidence?.traits || []), ...traits])],
          };
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
      if (evidence && (boardCount >= 2 || evidence.gold != null || evidence.augmentIds.length || (boardCount && previous?.augmentIds.length))) {
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
    economy.value = augment.value = '';
    onViewChange();
    render();
    if (view.value) {
      if (getContext()?.setData.set === 18) void warmOpponentAugmentIcons();
      readCurrent();
    }
    else signal('当前是我的视角。');
  };
  economy.onchange = augment.onchange = render;
  saveProfile.onclick = () => {
    const slot = view.value;
    const context = getContext();
    if (!slot || !context || (!economy.value && !augment.value)) return;
    pending.delete(slot);
    const previous = context.boards.get(slot);
    save(slot, {
      units: previous?.units || [],
      traits: previous?.traits || [],
      gold: economy.value ? null : previous?.gold ?? null,
      economy: economy.value || previous?.economy || '',
      augmentIds: augment.value ? [augment.value] : previous?.augmentIds || [],
    }, context);
    economy.value = augment.value = '';
    signal('已更新对手 ' + slot + ' 的补充信息。');
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
    reset() {
      pending.clear();
      view.value = economy.value = augment.value = '';
      signal('当前是我的视角。');
      render();
    },
  };
}
