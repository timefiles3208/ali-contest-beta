import { rolldownSummary } from '../engine/rolldown.js';
import { openingDecision } from '../engine/opening.js?v=scout-direction';

export function recommendedLineups(ranked = [], { allowUnmatched = false } = {}) {
  return allowUnmatched || ranked.some(row => row.viable || row.hasOpponentEvidence || row.planning) ? ranked.slice(0, 3) : [];
}

export function formationRoles(formation) {
  if (!formation) return '';
  const format = unit => `${unit.name} ${unit.cost}费 ${unit.stars}星${unit.sourceStars ? '' : '参考'}`;
  const carryLabel = formation.carries.some(unit => unit.carry) ? '主 C' : '核心';
  return [
    formation.carries.length && `${carryLabel} ${formation.carries.map(format).join('、')}`,
    formation.tanks.length && `主坦 ${formation.tanks.map(format).join('、')}`,
  ].filter(Boolean).join(' · ');
}

function formationStages(formation) {
  if (!formation?.rolls.length) return '';
  return formation.rolls.map(({ level, targets }) => {
    const chase = targets.filter(unit => unit.stars >= 3).map(unit => `${unit.name} ${unit.stars}星`);
    const search = targets.filter(unit => unit.stars < 3 && unit.cost >= 4).map(unit => unit.name);
    const pickup = targets.filter(unit => unit.stars < 3 && unit.cost <= 3).map(unit => unit.name);
    return [chase.length && `${level} 级追 ${chase.join('、')}`,
      search.length && `${level} 级搜 ${search.join('、')}`,
      pickup.length && `${level} 级前后顺手补 ${pickup.join('、')}`].filter(Boolean).join(' · ');
  }).join(' · ');
}

export function lineupSelectButton(comp, onSelect, selectedId, compact = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'lineup-select';
  const selected = selectedId === comp.id;
  button.textContent = compact ? comp.name : selected ? '查看方案' : '选定';
  button.setAttribute('aria-label', selected ? `查看已选的${comp.name}` : `选择${comp.name}`);
  button.setAttribute('aria-pressed', String(selected));
  button.onclick = () => onSelect(comp);
  return button;
}

export function renderLineupList(container, ranked, { label = '推荐阵容', link = false, emptyHint, allowUnmatched = false, onSelect, selectedId } = {}) {
  const rows = recommendedLineups(ranked, { allowUnmatched });
  if (!rows.length) {
    const prompt = document.createElement('p');
    prompt.className = 'fine';
    prompt.textContent = emptyHint || '';
    container.replaceChildren(...(emptyHint ? [prompt] : []));
    return false;
  }

  const heading = document.createElement('strong');
  heading.textContent = label;
  const planning = rows.some(row => row.planning);
  const decision = openingDecision(rows);
  const status = document.createElement('p');
  status.className = 'fine opening-decision';
  status.textContent = decision.label;
  const list = document.createElement('ol');
  list.className = 'ranked-lineups';
  for (const { comp, score, reasons, viable, hasOpponentEvidence, formation, roll } of rows) {
    const row = document.createElement('li');
    row.dataset.comp = comp.id;
    const name = document.createElement('strong');
    const role = decision.comp?.id === comp.id ? '主推' : '备选';
    name.textContent = (!planning && decision.comp ? role + ' · ' : '') + comp.name;
    const stats = document.createElement('span');
    stats.textContent = ` · ${comp.plannedEmblem && comp.rank ? '原榜单' : '榜单'} ${comp.rank?.tier || '未评级'} · 适配 ${score} 分 · 最终阵容 ${comp.level} 人口`;
    row.append(name, stats);
    if (onSelect) row.append(lineupSelectButton(comp, onSelect, selectedId));
    if (comp.plannedEmblem) {
      const note = document.createElement('p');
      note.className = 'fine';
      note.textContent = `纹章分配 · ${comp.plannedEmblem.name} → ${comp.plannedEmblem.bearer}`;
      row.append(note);
    }
    if (roll) {
      const estimate = document.createElement('p');
      estimate.className = 'fine';
      estimate.textContent = rolldownSummary(roll);
      row.append(estimate);
    }
    const plan = [formationRoles(formation), formationStages(formation)].filter(Boolean).join(' · ');
    if (plan) {
      const details = document.createElement('p');
      details.className = 'fine';
      details.textContent = plan;
      row.append(details);
    }
    const explanation = [...(viable ? [] : ['转型参考，当前开局条件未匹配。']),
      ...(viable || hasOpponentEvidence ? reasons : [])].join(' · ');
    if (explanation) {
      const detail = document.createElement('p');
      detail.className = 'fine';
      detail.textContent = explanation;
      row.append(detail);
    }
    list.append(row);
  }
  container.replaceChildren(heading, ...(planning ? [] : [status]), list);
  if (link) {
    const more = document.createElement('a');
    more.href = '#comps';
    more.textContent = '查看阵容攻略';
    container.append(more);
  }
  return true;
}
