import { screenScopeMismatch } from './game-scope.js';

const RESULT_TITLE = /对局结算|战绩结算|战绩详情|本局战绩|赛后结算|结算详情|返回大厅|再来一局/;
const RANK_DIGITS = '一二三四五六七八';

export function postgameReview(text, { setData, items, comps }) {
  const normalized = (text || '').normalize('NFKC');
  const lines = normalized.split('\n').map(line => line.replace(/\s+/g, ''));
  const scopeError = screenScopeMismatch(normalized, setData?.scope);
  if (scopeError) return { error: scopeError };
  const visible = lines.join('\n');
  const ranks = new Set(Array.from(visible.matchAll(/(?:第([1-8一二三四五六七八])名|(?:本局排名|最终排名|名次):?\n?第?([1-8一二三四五六七八])(?!\d))/g), match => {
    const digit = match[1] || match[2];
    return Number(digit) || RANK_DIGITS.indexOf(digit) + 1;
  }));
  if (!RESULT_TITLE.test(visible) || ranks.size !== 1) {
    return { error: '未能确认本人结算名次。请导入含结算标题和一个明确名次的截图。' };
  }

  function ownFields(label, entries) {
    const row = lines.findIndex(line => label.test(line));
    if (row < 0) return [];
    const value = lines[row].replace(label, '') || lines.slice(row + 1).find(Boolean) || '';
    const names = new Map();
    for (const entry of entries || []) {
      if (entry.name) names.set(entry.name, names.has(entry.name) ? null : entry);
    }
    return [...names.values()].filter(entry => entry && value.includes(entry.name));
  }

  const units = ownFields(/^(?:我的阵容|我的棋子|我的上阵棋子|本局阵容):?/, setData?.units);
  const equipment = ownFields(/^(?:我的[装妆]备|本局[装妆]备):?/, items?.items);
  const known = new Set(units.map(unit => unit.id));
  const comparisons = known.size < 2 ? [] : (comps || []).map(comp => ({
    name: comp.name,
    count: new Set((comp.units || []).map(unit => typeof unit === 'string' ? unit : unit.id).filter(id => known.has(id))).size,
  })).filter(row => row.count >= 2).sort((a, b) => b.count - a.count).slice(0, 3);
  return { rank: [...ranks][0], units, equipment, comparisons };
}
