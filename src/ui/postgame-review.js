import { imageKind, MAX_SOURCE_BYTES } from '../adapters/snapshot.js?v=game-release-scope-2';
import { readPostgameText } from '../adapters/local-ocr.js?v=postgame-review';
import { withinRecognitionBudget } from '../engine/recognition-budget.js';
import { postgameReview } from '../engine/postgame-review.js';

export function bindPostgameReview({ panel, input, clear, status, output, getContext }) {
  let generation = 0;

  function reset(enabled) {
    generation++;
    panel.hidden = !enabled;
    input.value = '';
    output.replaceChildren();
    status.textContent = '';
    status.className = 'snap-status';
    clear.disabled = true;
  }

  function addResult(label, value) {
    const row = document.createElement('p');
    const heading = document.createElement('strong');
    heading.textContent = label;
    row.append(heading, `　${value}`);
    output.append(row);
  }

  input.addEventListener('change', async () => {
    const file = input.files[0];
    const context = getContext();
    if (!file || !context) return;
    reset(true);
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
      addResult('本局名次', `第 ${review.rank} 名`);
      addResult('棋子名称', review.units.map(unit => unit.name).join('、') || '未读到可归属本人的名称');
      addResult('装备名称', review.equipment.map(item => item.name).join('、') || '未读到可归属本人的名称');
      if (review.comparisons.length) {
        addResult('同版本阵容对照', review.comparisons.map(row => `${row.name}（重合 ${row.count} 个棋子）`).join('、'));
      }
      status.className = 'snap-status ok';
      status.textContent = '复盘完成，请核对读出的名称和名次。';
    } catch (error) {
      if (!current()) return;
      status.className = 'snap-status bad';
      status.textContent = error.message || '截图识别失败，请换一张清晰的结算截图。';
    }
  });
  clear.onclick = () => reset(!panel.hidden);
  return { reset };
}
