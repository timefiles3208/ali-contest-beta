import { recommend } from './recommend.js';

const labelText = text => text.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '');

function visibleMatches(lines, entries) {
  const labels = entries.map(({ id, name }) => ({ id, label: labelText(name) }))
    .sort((a, b) => b.label.length - a.label.length);
  const found = new Set();
  for (const line of lines) {
    let remaining = line;
    for (const { id, label } of labels) {
      if (!label || (label.length === 1 ? line !== label : !remaining.includes(label))) continue;
      found.add(id);
      remaining = remaining.split(label).join(' ');
    }
  }
  return entries.filter(({ id }) => found.has(id)).map(({ id }) => id);
}

function visibleStage(lines, hud) {
  const stages = new Set();
  for (const line of lines) {
    const normalized = line.replace(/[‐‑–—−]/g, '-');
    for (const segment of normalized.split('|')) {
      const explicit = segment.trim().match(/^(?:阶段\s*:?\s*|stage(?:\s*:\s*|\s+))?([1-9])\s*-\s*([1-7])$/i);
      if (explicit) stages.add(`${explicit[1]}-${explicit[2]}`);
    }
    if (hud && !/\p{Script=Han}/u.test(normalized)) {
      for (const match of normalized.matchAll(/(?<![\p{L}\p{N}._/-])([1-9])\s*-\s*([1-7])(?![\p{L}\p{N}._/-])/gu)) {
        stages.add(`${match[1]}-${match[2]}`);
      }
    }
  }
  return stages.size === 1 ? [...stages][0] : null;
}

export function screenEvidence(text, setData, { hud = false } = {}) {
  const lines = text.normalize('NFKC').split(/\r?\n/).map(line => line.trim());
  const labels = lines.map(labelText);
  return {
    stage: visibleStage(lines, hud),
    units: visibleMatches(labels, setData.units),
    traits: visibleMatches(labels, setData.traits || []),
  };
}

export function mergeScreenEvidence(...reads) {
  const stages = new Set(reads.map(read => read.stage).filter(Boolean));
  return {
    stage: stages.size === 1 ? [...stages][0] : null,
    units: [...new Set(reads.flatMap(read => read.units))],
    traits: [...new Set(reads.flatMap(read => read.traits))],
  };
}

export function openingNamesInText(text, { cities, augments }) {
  const lines = text.split(/\r?\n/).map(labelText);
  return { cities: visibleMatches(lines, cities), offered: visibleMatches(lines, augments) };
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
