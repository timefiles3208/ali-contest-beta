import { recommend } from './recommend.js';

function visibleMatches(lines, entries) {
  return entries.filter(({ name }) => {
    const label = name.replace(/\s+/g, '');
    return lines.some(line => line === label || (label.length >= 2 && line.includes(label)));
  }).map(({ id }) => id);
}

export function screenEvidence(text, setData) {
  const lines = text.normalize('NFKC').split(/\r?\n/).map(line => line.trim());
  const stages = new Set(lines.map(line => {
    const match = line.match(/^([1-9])\s*[-‐‑–—]\s*([1-7])$/);
    return match && `${match[1]}-${match[2]}`;
  }).filter(Boolean));
  const labels = lines.map(line => line.replace(/\s+/g, ''));
  return {
    stage: stages.size === 1 ? [...stages][0] : null,
    units: visibleMatches(labels, setData.units),
    traits: visibleMatches(labels, setData.traits || []),
  };
}

export function stageAfterOpening(stage) {
  return Boolean(stage && stage !== '2-1' && Number(stage[0]) >= 2);
}

export function screenDirection(setData, comps, { units, traits }, level = 7) {
  const picked = new Set(units);
  const visibleTraits = new Set(traits);
  const ranked = recommend({ setData, comps, selected: picked, level });
  let best = null;
  let bestScore = -Infinity;
  for (const { comp, score } of ranked) {
    const unitHits = comp.units.filter(id => picked.has(id)).length;
    const traitHits = Object.keys(comp.aimTraits || {}).filter(id => visibleTraits.has(id)).length;
    if (!unitHits && !traitHits) continue;
    const directionScore = score + 6 * unitHits + 10 * traitHits;
    if (directionScore > bestScore) {
      best = comp;
      bestScore = directionScore;
    }
  }
  return best;
}
