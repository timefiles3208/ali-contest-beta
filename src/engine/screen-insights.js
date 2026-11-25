import { recommend } from './recommend.js';
import { SET18_ENGLISH } from '../data/set18-ocr-en.js';

const labelText = text => text.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '');
const regionLabel = text => text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}+]/gu, '');

export function entriesForOcr(entries, season) {
  if (season !== 18) return entries;
  return entries.flatMap(entry => {
    const alias = SET18_ENGLISH[entry.id];
    return alias ? [entry, { id: entry.id, name: alias }] : [entry];
  });
}

function visibleEnglish(text, entries, season) {
  if (season !== 18) return [];
  const aliases = new Map();
  for (const { id } of entries) {
    const name = SET18_ENGLISH[id]?.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!name || name.length < 3) continue;
    aliases.set(name, aliases.has(name) ? null : id);
  }
  const lines = text.toLowerCase().split(/\r?\n/).map(line => ` ${line.replace(/[^a-z0-9]+/g, ' ').trim()} `);
  return [...aliases].flatMap(([name, id]) => id && lines.some(line => line.includes(` ${name} `)) ? [id] : []);
}

export function hasMatchFrame(stage, text) {
  if (stage) return true;
  const compact = text.replace(/\s/g, '');
  return /购买经验|BuyXP/i.test(compact) && /刷新|Reroll/i.test(compact);
}

export function matchRegionLabel(text, entries) {
  const label = regionLabel(text);
  if (!label) return null;
  const labels = entries.map(({ id, name }) => ({ id, name: regionLabel(name) }));
  const exact = [...new Set(labels.filter(row => row.name === label).map(row => row.id))];
  if (exact.length) return exact.length === 1 ? exact[0] : null;
  if (!/^\p{Script=Han}{3,}[+]*$/u.test(label)) return null;
  const suffix = label.match(/\+*$/)[0];
  const near = labels.filter(({ name }) => name.length === label.length &&
    name.match(/\+*$/)[0] === suffix &&
    [...label].filter((char, i) => char !== name[i]).length === 1);
  return near.length === 1 ? near[0].id : null;
}

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
    units: [...new Set([...visibleMatches(labels, setData.units), ...visibleEnglish(text, setData.units, setData.set)])],
    traits: [...new Set([...visibleMatches(labels, setData.traits || []), ...visibleEnglish(text, setData.traits || [], setData.set)])],
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

export function openingNamesInText(text, cities, augments) {
  const lines = text.split(/\r?\n/);
  const titles = new Map();
  for (const { id, name } of augments) {
    const label = regionLabel(name);
    titles.set(label, titles.has(label) && titles.get(label) !== id ? null : id);
  }
  const offered = [...new Set(lines.map(line => titles.get(regionLabel(line))).filter(Boolean))];
  return { cities: visibleMatches(lines.map(labelText), cities), offered };
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

export function readOpponentProfile(text, augments) {
  const lines = text.normalize('NFKC').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const goldReadings = new Set();
  const selectedTitles = [];
  for (const [index, line] of lines.entries()) {
    const gold = line.match(/^(?:(?:对\s*[手方]|敌\s*方)\s*金\s*币|opponent\s+gold)\s*[:：]?\s*(\d{1,3})\s*$/i);
    if (gold) goldReadings.add(Number(gold[1]));
    const selected = line.match(/^(?:(?:已\s*选(?:\s*择)?|对\s*[手方]已\s*选)\s*(?:海\s*克\s*斯|强\s*化\s*符\s*文)|selected\s+augment)\s*(?:[:：]\s*)?(.*)$/i);
    if (selected) selectedTitles.push(selected[1].trim() || lines[index + 1] || '');
  }
  return {
    gold: goldReadings.size === 1 ? [...goldReadings][0] : null,
    augmentIds: openingNamesInText(selectedTitles.join('\n'), [], augments).offered,
  };
}
