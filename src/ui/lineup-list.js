export function recommendedLineups(ranked = []) {
  return ranked.some(row => row.viable || row.hasOpponentEvidence) ? ranked.slice(0, 3) : [];
}

export function renderLineupList(container, ranked, { label = '推荐阵容', link = false, emptyHint } = {}) {
  const rows = recommendedLineups(ranked);
  if (!rows.length) {
    const prompt = document.createElement('p');
    prompt.className = 'fine';
    prompt.textContent = emptyHint || '';
    container.replaceChildren(...(emptyHint ? [prompt] : []));
    return false;
  }

  const heading = document.createElement('strong');
  heading.textContent = label;
  const list = document.createElement('ol');
  list.className = 'ranked-lineups';
  for (const { comp, score, reasons, viable, hasOpponentEvidence } of rows) {
    const row = document.createElement('li');
    row.dataset.comp = comp.id;
    const name = document.createElement('strong');
    name.textContent = comp.name;
    const stats = document.createElement('span');
    stats.textContent = ` · 榜单 ${comp.rank?.tier || '未评级'} · 适配 ${score} 分 · ${comp.level} 人口`;
    row.append(name, stats);
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
  container.replaceChildren(heading, list);
  if (link) {
    const more = document.createElement('a');
    more.href = '#comps';
    more.textContent = '查看阵容攻略';
    container.append(more);
  }
  return true;
}
