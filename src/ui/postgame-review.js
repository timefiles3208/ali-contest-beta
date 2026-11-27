import { imageKind, MAX_SOURCE_BYTES } from '../adapters/snapshot.js?v=game-release-scope-2';
import { readPostgameText } from '../adapters/local-ocr.js?v=postgame-review';
import { withinRecognitionBudget } from '../engine/recognition-budget.js';
import { comparePostgameLineups, importPostgameLineup, postgameReview } from '../engine/postgame-review.js?v=lineup-import';

export function bindPostgameReview({ panel, input, clear, status, output, getContext, lineupForm }) {
  let generation = 0;
  let screenshot = null;
  let imported = null;

  function resetImage() {
    generation++;
    screenshot = null;
    input.value = '';
    status.textContent = '';
    status.className = 'snap-status';
    clear.disabled = true;
  }

  function reset(enabled) {
    resetImage();
    panel.hidden = !enabled;
    imported = null;
    lineupForm?.reset();
    const lineupStatus = lineupForm?.querySelector('[role="status"]');
    if (lineupStatus) lineupStatus.textContent = '';
    const remove = lineupForm?.querySelector('[data-remove-lineup]');
    if (remove) remove.disabled = true;
    output.replaceChildren();
  }

  function addResult(label, value) {
    const row = document.createElement('p');
    const heading = document.createElement('strong');
    heading.textContent = label;
    row.append(heading, `　${value}`);
    output.append(row);
  }

  function render(context) {
    output.replaceChildren();
    if (screenshot) {
      addResult('本局名次', `第 ${screenshot.rank} 名`);
      addResult('截图装备', screenshot.equipment.map(item => item.name).join('、') || '未读到可归属本人的名称');
    }
    const lineup = imported || screenshot;
    if (!lineup) return;
    addResult(imported ? '导入阵容' : '棋子名称', lineup.units.map(unit => unit.name).join('、') || '未读到可归属本人的名称');
    const comparisons = imported ? comparePostgameLineups(imported.units, context?.comps) : screenshot.comparisons;
    if (comparisons.length) {
      addResult('同版本阵容对照', comparisons.map(row => `${row.name}（重合 ${row.count} 个棋子）`).join('、'));
    }
  }

  if (lineupForm) {
    const entry = lineupForm.elements.namedItem('lineup');
    const feedback = lineupForm.querySelector('[role="status"]');
    const remove = lineupForm.querySelector('[data-remove-lineup]');
    lineupForm.addEventListener('submit', event => {
      event.preventDefault();
      const context = getContext();
      if (!context || panel.hidden) return;
      const result = importPostgameLineup(entry.value, context);
      feedback.className = `snap-status ${result.error ? 'bad' : 'ok'}`;
      feedback.textContent = result.error || `已导入 ${result.units.length} 名棋子${result.name ? `（${result.name}）` : ''}。`;
      if (result.error) return;
      imported = result;
      remove.disabled = false;
      render(context);
    });
    remove.onclick = () => {
      imported = null;
      lineupForm.reset();
      remove.disabled = true;
      feedback.textContent = '';
      render(getContext());
    };
  }

  input.addEventListener('change', async () => {
    const file = input.files[0];
    const context = getContext();
    if (!file || !context) return;
    resetImage();
    render(context);
    clear.disabled = false;
    const request = generation;
    const current = () => generation === request && !panel.hidden;
    status.className = 'snap-status wait';
    status.textContent = '正在本机识别截图…';
    try {
      if (file.size > MAX_SOURCE_BYTES) throw new Error('请选择不超过 20 MB 的图片。');
      if (!await imageKind(file)) throw new Error('图片格式无法识别，请尝试 JPG、PNG 或 WebP。');
      if (!current()) return;
      const { value, timedOut } = await withinRecognitionBudget(active => readPostgameText(file, () => current() && active()));
      if (!current()) return;
      if (timedOut) throw new Error('本机识别超时。可以裁掉空白区域后重试。');
      const review = postgameReview(value, context);
      if (review.error) throw new Error(review.error);
      screenshot = review;
      render(context);
      status.className = 'snap-status ok';
      status.textContent = '复盘完成，请核对读出的名称和名次。';
    } catch (error) {
      if (!current()) return;
      status.className = 'snap-status bad';
      status.textContent = error.message || '截图识别失败，请换一张清晰的结算截图。';
    }
  });
  clear.onclick = () => {
    resetImage();
    render(getContext());
  };
  return { reset };
}
