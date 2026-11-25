import { recognizeOpponentLabels } from '../adapters/local-ocr.js?v=opponent-scout';
import { predictOpponentRoutes } from '../engine/opponent-scout.js';
import { withinRecognitionBudget } from '../engine/recognition-budget.js';

export function bindOpponentScout({ view, capture, photo, unit, add, save, clear, clearAll, choices, status, summary, getContext, getFrame, onChange, onViewChange }) {
  let draft = new Map();
  let revision = 0;
  const signal = text => { status.textContent = text; };

  function render() {
    const context = getContext();
    const slot = view.value;
    const available = Boolean(context?.comps.length && slot);
    capture.disabled = photo.disabled = unit.disabled = add.disabled = !available;
    const roster = context?.setData?.units || [];
    if (unit.options.length !== roster.length + 1 || unit.dataset.season !== String(context?.setData?.set)) {
      unit.dataset.season = String(context?.setData?.set);
      unit.replaceChildren(new Option('选择棋子', ''), ...roster.map(row => new Option(row.name, row.id)));
    }
    save.disabled = !available || ![...draft.values()].some(Boolean);
    clear.disabled = !available || (!context?.opponents.has(slot) && !draft.size);
    clearAll.disabled = !context?.opponents.size && !draft.size;
    choices.replaceChildren(...[...draft].map(([id, checked]) => {
      const row = document.createElement('label');
      const name = roster.find(unit => unit.id === id)?.name;
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = checked;
      box.onchange = () => { draft.set(id, box.checked); save.disabled = ![...draft.values()].some(Boolean); };
      row.append(box, name || '');
      return row;
    }));
    const predictions = context ? predictOpponentRoutes(context.comps, context.opponents, context.patch) : [];
    summary.replaceChildren(...predictions.map(({ slot, comp, units }) => {
      const item = document.createElement('li');
      item.textContent = comp
        ? `对手 ${slot} · ${units} 种已核对棋子 · 可能走 ${comp.name}`
        : `对手 ${slot} · ${units} 种已核对棋子 · 暂无明确方向`;
      return item;
    }));
    summary.hidden = !predictions.length;
  }

  async function read(input) {
    const slot = view.value;
    const context = getContext();
    if (!slot || !context?.comps.length) return;
    const job = ++revision;
    signal('正在读取对手棋子名称…');
    try {
      const result = await withinRecognitionBudget(async current => {
        const image = await input();
        if (!image) return null;
        try {
          let canvas = image;
          if (!image.getContext) {
            canvas = document.createElement('canvas');
            const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
            canvas.width = Math.max(1, Math.round(image.width * scale));
            canvas.height = Math.max(1, Math.round(image.height * scale));
            canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
          }
          return await recognizeOpponentLabels(canvas, context.setData, () => current() && revision === job);
        } finally {
          image.close?.();
        }
      });
      if (revision !== job) return;
      const ids = result.value;
      if (ids?.length) {
        ids.forEach(id => { if (!draft.has(id)) draft.set(id, false); });
        signal('请勾选确实在该对手阵容中的棋子。');
      } else {
        signal(result.timedOut ? '读取已到等待上限，可手动登记对手棋子。'
          : '未读到棋子名称。请显示棋子名称或手动登记。');
      }
    } catch {
      if (revision === job) signal('无法读取该画面，可手动登记对手棋子。');
    } finally {
      if (revision === job) render();
    }
  }

  view.onchange = () => {
    revision++;
    draft = new Map([...(getContext()?.opponents.get(view.value) || [])].map(id => [id, true]));
    signal(view.value ? `当前是对手 ${view.value} 视角。核对后保存到该对手。` : '当前是我的视角。');
    onViewChange();
    render();
  };
  capture.onclick = () => {
    const frame = getFrame();
    if (!frame) { signal('请先共享游戏窗口，或导入对手截图。'); return; }
    void read(() => frame);
  };
  photo.onchange = () => {
    const file = photo.files[0];
    photo.value = '';
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { signal('请选择 20 MB 以内的截图。'); return; }
    void read(() => createImageBitmap(file));
  };
  add.onclick = () => {
    if (!unit.value) return;
    draft.set(unit.value, true);
    render();
  };
  save.onclick = () => {
    revision++;
    const checked = [...draft].filter(([, selected]) => selected).map(([id]) => id);
    if (!view.value || !checked.length) return;
    onChange(view.value, checked);
    signal(`已保存对手 ${view.value} 的 ${checked.length} 种棋子。`);
    render();
  };
  clear.onclick = () => {
    revision++;
    draft.clear();
    onChange(view.value, []);
    signal('已清除这个对手的记录。');
    render();
  };
  clearAll.onclick = () => {
    revision++;
    draft.clear();
    onChange(null, []);
    signal('已清空本局对手记录。');
    render();
  };
  return {
    render,
    reset() {
      revision++;
      draft.clear();
      view.value = '';
      signal('当前是我的视角。');
      render();
    },
  };
}
