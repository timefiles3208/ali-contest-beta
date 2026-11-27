import { imageKind, MAX_SOURCE_BYTES } from '../adapters/snapshot.js?v=game-release-scope-2';
import { readPostgameText } from '../adapters/local-ocr.js?v=postgame-review';
import { withinRecognitionBudget } from '../engine/recognition-budget.js';
import { analyzePostgameLineup, importPostgameLineup, postgameReview } from '../engine/postgame-review.js?v=lineup-analysis';

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

  function addResult(label, value, target = output) {
    const row = document.createElement('p');
    const heading = document.createElement('strong');
    heading.textContent = label;
    row.append(heading, `　${value}`);
    target.append(row);
  }

  function renderAnalysis(analysis, hasEquipment) {
    const section = document.createElement('section');
    section.className = 'postgame-analysis';
    const heading = document.createElement('h3');
    heading.textContent = '赛后阵容分析';
    section.append(heading);
    output.append(section);
    if (!analysis) {
      addResult('阵容信息不足', '补录上阵棋子后即可分析。', section);
      return;
    }
    const { count, active, near, comparisons } = analysis;
    const activeNames = active.map(trait => `${trait.name} ${trait.tier} 档`).join('、');
    addResult(`羁绊（按 ${count} 名上阵棋子）`, activeNames || '暂无达到人数门槛的羁绊', section);
    if (near.length) addResult('差一名到下一档', near.map(trait => `${trait.name} ${trait.num}/${trait.next}`).join('、'), section);
    if (!comparisons.length) {
      addResult('同版本阵容对照', '暂无至少重合两名棋子的榜单阵容。', section);
      return;
    }
    const subheading = document.createElement('h4');
    subheading.textContent = '同版本阵容对照';
    section.append(subheading);
    comparisons.forEach((reference, index) => {
      const details = document.createElement('details');
      details.className = 'reference-lineup';
      details.open = index === 0;
      const summary = document.createElement('summary');
      const tier = reference.tier ? ` · 榜单 ${reference.tier} 级` : '';
      summary.textContent = `${reference.name}${tier} · 重合 ${reference.count}/${reference.total} 名`;
      const rows = document.createElement('div');
      rows.className = 'reference-lineup-detail';
      addResult('重合核心', reference.sharedCore.join('、') || '无', rows);
      if (reference.missingCore.length) addResult('榜单核心差异', reference.missingCore.join('、'), rows);
      if (reference.missing.length) addResult('仅榜单有', reference.missing.join('、'), rows);
      if (reference.extra.length) addResult('仅本局有', reference.extra.join('、'), rows);
      if (hasEquipment) {
        const gear = reference.equipment.map(item => `${item.name} → ${item.holders.join('、')}`).join('；');
        addResult('截图装备在榜单的搭配', gear || '重合棋子的榜单装备暂无对应', rows);
      }
      details.append(summary, rows);
      section.append(details);
    });
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
    const equipment = screenshot?.equipment || [];
    renderAnalysis(context && analyzePostgameLineup(lineup.units, equipment, context), equipment.length > 0);
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
