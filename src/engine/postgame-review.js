import { screenScopeMismatch } from './game-scope.js';
import { traitBreakdown } from './recommend.js';

const RESULT_TITLE = /对局结算|战绩结算|战绩详情|本局战绩|赛后结算|结算详情|返回大厅|再来一局/;
const RANK_DIGITS = '一二三四五六七八';

export function analyzePostgameLineup(units, equipment, { setData, comps = [], stars = {} }) {
  const byUnit = new Map((setData?.units || []).map(unit => [unit.id, unit]));
  const selected = new Set(units.map(unit => unit.id).filter(id => byUnit.has(id)));
  if (!selected.size) return null;

  const thresholds = new Map((setData.traits || []).map(trait => [trait.id, trait.tiers || []]));
  const traits = traitBreakdown(setData, selected);
  const active = traits.filter(trait => trait.tier > 0);
  const near = traits.flatMap(trait => thresholds.get(trait.id)?.some(tier => tier.min === trait.num + 1)
    ? [{ ...trait, next: trait.num + 1 }] : []);

  const comparisons = comps.map(comp => {
    const reference = new Set(comp.units.filter(id => byUnit.has(id)));
    const shared = [...reference].filter(id => selected.has(id));
    const core = new Set([...(comp.core || []), ...(comp.carry || [])].filter(id => reference.has(id)));
    const missing = [...reference].filter(id => !selected.has(id));
    const names = ids => ids.map(id => byUnit.get(id).name);
    return {
      name: comp.name,
      tier: comp.rank?.tier,
      stats: comp.rank,
      count: shared.length,
      total: reference.size,
      likeness: shared.length / (selected.size + missing.length),
      exact: shared.length === selected.size && missing.length === 0,
      sharedCore: names(shared.filter(id => core.has(id))),
      missingCore: names(missing.filter(id => core.has(id))),
      missing: names(missing),
      extra: names([...selected].filter(id => !reference.has(id))),
      starComparison: shared.flatMap(id => {
        const actual = stars[id];
        const listed = comp.stars?.[id];
        return actual && listed ? [{ name: byUnit.get(id).name, actual, listed }] : [];
      }),
      equipment: equipment.flatMap(item => {
        const holders = names(shared.filter(id => (comp.itemBuilds?.[id] || comp.items?.[id] || []).includes(item.id)));
        return holders.length ? [{ name: item.name, holders }] : [];
      }),
    };
  }).filter(row => row.count >= 2).sort((a, b) => b.likeness - a.likeness || b.sharedCore.length - a.sharedCore.length || b.count - a.count).slice(0, 3);
  return { count: selected.size, active, near, comparisons };
}

function lineupCode(value) {
  return /(?:^|#)([A-Za-z0-9+/]{24,}={0,2})(?:\s|$)/.exec(value)?.[1];
}

export function importPostgameLineup(value, { setData, comps = [] }) {
  if (setData?.scope?.sourceId !== 'dataj' || !setData.units?.length) {
    return { error: '所选金铲铲版本暂无卡池，暂时无法导入阵容。' };
  }
  const text = value.normalize('NFKC').trim();
  if (!text) return { error: '请输入阵容码或棋子名称。' };

  const code = lineupCode(text);
  const byId = new Map(setData.units.map(unit => [unit.id, unit]));
  if (code || text.includes('阵容码')) {
    const matches = code ? comps.filter(comp => comp.teamCode && lineupCode(comp.teamCode) === code) : [];
    const signatures = new Set(matches.map(comp => [...new Set(comp.units)].sort().join(',')));
    const match = signatures.size === 1 ? matches[0] : null;
    const units = match ? [...new Set(match.units)].map(id => byId.get(id)) : [];
    if (!units.length || units.some(unit => !unit)) {
      return { error: '这个阵容码无法在所选版本解析，请核对版本或改填上阵棋子名称。' };
    }
    return { units, name: match.name };
  }

  const entries = [...new Set(text.split(/[、,;\s]+/).filter(Boolean))];
  const selected = new Map();
  const stars = {};
  const unmatched = [];
  for (const entry of entries) {
    const annotated = /^(.+?)([1-4])星$/.exec(entry);
    const name = annotated?.[1] || entry;
    const matches = setData.units.filter(unit => unit.name === name);
    if (matches.length !== 1) {
      unmatched.push(matches.length ? `${name}（有同名棋子）` : name);
      continue;
    }
    const [unit] = matches;
    selected.set(unit.id, unit);
    if (!annotated) continue;
    const value = Number(annotated[2]);
    if (stars[unit.id] && stars[unit.id] !== value) return { error: `${name}填写了不同星级，请核对。` };
    stars[unit.id] = value;
  }
  if (unmatched.length) return { error: `有棋子无法确认：${unmatched.join('、')}。请核对版本和名称。` };
  if (!selected.size) return { error: '请输入至少一个上阵棋子的名称。' };
  return { units: [...selected.values()], stars };
}

export function postgameReview(text, { setData, items }) {
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
  return { rank: [...ranks][0], units, equipment };
}
