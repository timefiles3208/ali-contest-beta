const SEASON = 18;
const PATCH = '18.7';
const RANKED_QUEUE = 1100;
const MIN_BOARD_UNITS = 5;
const MIN_OVERLAP = 4;
const MIN_SIMILARITY = 0.55;
const MIN_MARGIN = 0.08;
const MAX_VARIANTS = 3;
const averagePlacement = (total, samples) => Math.round(100 * total / samples) / 100;

const validVersion = version => typeof version === 'string'
  && /^(?:Version\s+)?(?:16\.23|18\.7)(?:[.\s]|$)/i.test(version.trim());

export function unpackMatchFile(document) {
  if (Array.isArray(document)) return document;
  if (Array.isArray(document?.matches)) return document.matches;
  if (document?.metadata && document.info) return [document];
  if (document?.data?.metadata && document.data.info) return [document];
  throw new Error('文件需要包含 Riot TFT 对局详情 JSON。');
}

function closestComp(units, candidates) {
  if (units.size < MIN_BOARD_UNITS) return null;
  const scores = candidates.flatMap(({ comp, target }) => {
    const shared = [...units].filter(id => target.has(id)).length;
    const similarity = shared / (target.size + units.size - shared);
    return shared >= MIN_OVERLAP && similarity >= MIN_SIMILARITY ? [{ comp, similarity }] : [];
  }).sort((a, b) => b.similarity - a.similarity);
  if (!scores.length || (scores[1] && scores[0].similarity - scores[1].similarity < MIN_MARGIN)) return null;
  return scores[0].comp;
}

export function aggregateTftMatches(records, { comps, setData }) {
  if (setData?.set !== SEASON) throw new Error('对局文件只支持 S18 版本 18.7。');
  const known = new Set(setData.units.map(unit => unit.id));
  const candidates = comps.map(comp => ({ comp, target: new Set(comp.units) }));
  const seen = new Set();
  const totals = new Map();
  const output = { season: SEASON, version: PATCH, matches: 0, duplicates: 0, versionSkipped: 0,
    queueSkipped: 0, invalid: 0, matchedBoards: 0, unmatchedBoards: 0, comps: [] };

  for (const record of records) {
    const data = record?.metadata ? record : record?.data;
    const id = data?.metadata?.match_id;
    const info = data?.info;
    const people = info?.participants;
    if (typeof id !== 'string' || !id.trim() || !info) { output.invalid++; continue; }
    if (info.tft_set_number !== SEASON || !validVersion(info.game_version)) { output.versionSkipped++; continue; }
    if (info.queue_id !== RANKED_QUEUE) { output.queueSkipped++; continue; }
    if (!Array.isArray(people) || people.length !== 8 ||
      new Set(people.map(row => row?.placement)).size !== 8 ||
      people.some(row => !Number.isInteger(row?.placement) || row.placement < 1 || row.placement > 8 || !Array.isArray(row.units))) {
      output.invalid++;
      continue;
    }
    if (seen.has(id)) { output.duplicates++; continue; }
    seen.add(id);
    output.matches++;

    for (const { units, placement, level } of people) {
      const lineup = units.map(unit => String(unit?.character_id || '').replace(/^TFT18_/, 'DA_18_'));
      const board = new Set(lineup.filter(id => known.has(id)));
      const comp = closestComp(board, candidates);
      if (!comp) { output.unmatchedBoards++; continue; }
      output.matchedBoards++;
      const row = totals.get(comp.id) || { id: comp.id, name: comp.name, samples: 0, four: 0, wins: 0, place: 0,
        variants: new Map() };
      row.samples++;
      row.four += Number(placement <= 4);
      row.wins += Number(placement === 1);
      row.place += placement;
      totals.set(comp.id, row);

      if (!lineup.every(id => known.has(id))) continue;
      const finalLevel = Number.isInteger(level) && level > 0 ? level : null;
      lineup.sort();
      const key = JSON.stringify([finalLevel, lineup]);
      const variant = row.variants.get(key) || { level: finalLevel, units: lineup, samples: 0, place: 0 };
      variant.samples++;
      variant.place += placement;
      row.variants.set(key, variant);
    }
  }

  const rounded = value => Math.round(value * 10) / 10;
  output.comps = [...totals.values()].map(({ id, name, samples, four, wins, place, variants }) => ({
    id, name, samples, top4: rounded(100 * four / samples), first: rounded(100 * wins / samples),
    average: averagePlacement(place, samples),
    variants: [...variants.values()].map(({ place, ...variant }) => ({
      ...variant, average: averagePlacement(place, variant.samples),
    })).sort((a, b) => b.samples - a.samples || a.average - b.average).slice(0, MAX_VARIANTS),
  })).sort((a, b) => Number(b.samples >= 10) - Number(a.samples >= 10)
    || b.top4 - a.top4 || a.average - b.average || b.samples - a.samples);
  return output;
}
