import { recognizeOpponentLabels, warmOpeningOcr } from '../adapters/local-ocr.js?v=scout-2-1';
import { predictOpponentRoutes } from '../engine/opponent-scout.js';
import { withinRecognitionBudget } from '../engine/recognition-budget.js';

const SCOUT_BUDGET_MS = 5_000;

export function bindOpponentScout({ view, capture, photo, clear, clearAll, status, summary, getContext, getFrame, onChange, onViewChange }) {
  const pending = new Map();
  const signal = text => { status.textContent = text; };

  function render() {
    const context = getContext();
    const slot = view.value;
    const available = Boolean(context?.comps.length && slot);
    capture.disabled = photo.disabled = !available;
    clear.disabled = !available || (!context.boards.has(slot) && !pending.has(slot));
    clearAll.disabled = !context?.boards.size && !pending.size;
    const names = new Map([...(context?.setData.units || []), ...(context?.setData.traits || [])].map(row => [row.id, row.name]));
    const records = [...(context?.boards || [])].sort(([a], [b]) => Number(a) - Number(b));
    summary.replaceChildren(...records.map(([number, { units, traits, routes }]) => {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = '对手 ' + number;
      const detail = document.createElement('span');
      const observed = [...units, ...traits].map(id => names.get(id)).filter(Boolean);
      detail.textContent = ' · 最近识别：' + observed.join('、');
      item.append(title, detail);
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

  async function read(input) {
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
      const result = await withinRecognitionBudget(async current => {
        const image = await input();
        try {
          if (!current() || !isLatest()) return null;
          let canvas = image;
          if (!image.getContext) {
            canvas = document.createElement('canvas');
            const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
            canvas.width = Math.max(1, Math.round(image.width * scale));
            canvas.height = Math.max(1, Math.round(image.height * scale));
            canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
          }
          return await recognizeOpponentLabels(canvas, context.setData, () => current() && isLatest());
        } finally {
          image.close?.();
        }
      }, SCOUT_BUDGET_MS);
      if (!isLatest()) return;
      const evidence = result.value;
      if (evidence && evidence.units.length + evidence.traits.length >= 2) {
        const routes = predictOpponentRoutes(context.comps, evidence, context.patch);
        onChange(slot, { ...evidence, routes });
        report(routes.length ? '已更新对手 ' + slot + ' 的可能阵容。' : '已更新画面，暂未匹配到阵容。');
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
    const frame = getFrame();
    if (!frame) {
      void warmOpeningOcr().catch(() => {});
      signal('可共享游戏窗口，或导入该对手的截图。');
      return;
    }
    void read(() => frame);
  }

  view.onchange = () => {
    onViewChange();
    render();
    if (view.value) readCurrent();
    else signal('当前是我的视角。');
  };
  capture.onclick = readCurrent;
  photo.onchange = () => {
    const file = photo.files[0];
    photo.value = '';
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { signal('请选择 20 MB 以内的截图。'); return; }
    void read(() => createImageBitmap(file));
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
      view.value = '';
      signal('当前是我的视角。');
      render();
    },
  };
}
