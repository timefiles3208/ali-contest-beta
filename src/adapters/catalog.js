import { loadJson } from '../ui/helpers.js?v=fast-catalog';

const LIVE_ROOT = 'https://raw.githubusercontent.com/timefiles3208/ali-contest-beta';
const liveBundles = new Map();

const API = 'https://dubfaazkkthmwwtkplwm.supabase.co/rest/v1/tft_catalog';
const PUBLISHABLE_KEY = 'sb_publishable_AfgS6UsN9aDur-TYvK9d-w_M3UaILkp';

const named = row => typeof row?.id === 'string' && typeof row.name === 'string';
const namedStats = row => typeof row?.name === 'string';
const nonempty = (rows, accepts) => Array.isArray(rows) && rows.length > 0 && rows.every(accepts);
const optionalList = value => value == null || Array.isArray(value);
const hero = row => row && (row.summon || typeof row.key === 'string' || typeof row.name === 'string')
  && optionalList(row.tftEquips) && optionalList(row.items);
const composition = row => row?.id != null && typeof row.title === 'string' && nonempty(row.heroes || row.heros, hero);
const snapshots = new Map([
  ['./src/data/set18.json', ['units-traits', 'riot', '16.23.1',
    p => nonempty(p.units, row => named(row) && Number.isInteger(row.cost) && optionalList(row.traits))
      && nonempty(p.traits, row => named(row) && optionalList(row.tiers))]],
  ['./src/data/set18.items.json', ['items', 'riot', '16.23.1',
    p => nonempty(p.items, row => named(row) && optionalList(row.from)) && nonempty(p.components, named)]],
  ['./src/data/set18.augments.json', ['augments', 'riot', '16.23.1',
    p => nonempty(p.augments, row => named(row) && ['traits', 'grantTraits', 'grantUnits', 'grantItems', 'mentionsTraits', 'mentionsUnits'].every(field => optionalList(row[field])))]],
  ['./src/data/datatft/s18.18.7.comps.json', ['compositions', 'datatft', '18.7',
    p => nonempty(p.comps, composition)]],
  ['./src/data/datatft/s18.18.7.ratings.json', ['ratings', 'datatft', '18.7',
    p => nonempty(p.ratings?.items, namedStats) && nonempty(p.ratings?.augments, namedStats)]],
  ['./src/data/dataj/s18.18.7.catalog.json', ['game-catalog', 'dataj', '18.7',
    p => nonempty(p.units, row => named(row) && row.id.startsWith('jcc-unit:') && Number.isInteger(row.cost) && Array.isArray(row.traits))
      && nonempty(p.traits, row => named(row) && row.id.startsWith('jcc-trait:') && Array.isArray(row.tiers))
      && nonempty(p.items, row => named(row) && row.id.startsWith('jcc-item:') && Array.isArray(row.from))
      && nonempty(p.components, row => named(row) && row.id.startsWith('jcc-item:'))
      && nonempty(p.augments, row => named(row) && row.id.startsWith('jcc-augment:'))]],
  ['./src/data/dataj/s18.18.7.json', ['rankings', 'dataj', '18.7',
    p => nonempty(p.comps, composition) && nonempty(p.items, namedStats) && nonempty(p.augments, namedStats)]],
]);

function validPayload(payload, source, version, accepts) {
  if ((payload?.set ?? payload?.season) !== 18) return false;
  const identityMatches = source === 'riot' ? payload.source?.ddragonVersion === version
    : payload.source === (source === 'datatft' ? 'datatft.com' : 'dataj.cc') && payload.version === version;
  return identityMatches && accepts(payload);
}

async function readDatabase(specs, signal) {
  const url = new URL(API);
  const clauses = specs.map(([dataset, source, version]) =>
    `and(dataset.eq.${dataset},source.eq.${source},season.eq.18,version.eq.${version})`);
  url.search = new URLSearchParams({
    select: 'dataset,source,season,version,payload',
    or: `(${clauses.join(',')})`,
  }).toString();
  const response = await fetch(url, {
    credentials: 'omit',
    headers: { apikey: PUBLISHABLE_KEY },
    signal: AbortSignal.any([signal, AbortSignal.timeout(3_500)]),
  });
  if (!response.ok) return null;
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length !== specs.length) return null;
  const values = specs.map(([dataset, source, version, accepts]) => {
    const row = rows.find(row => row?.dataset === dataset && row.source === source && row.version === version && row.season === 18);
    return validPayload(row?.payload, source, version, accepts) ? row.payload : null;
  });
  return values.every(Boolean) ? values : null;
}

async function loadLiveBundle(specs) {
  const [, source, version] = specs[0];
  if (!['datatft', 'dataj'].includes(source) || !specs.every(([, id, release]) => id === source && release === version)) return null;
  const key = source + '/' + version;
  const cached = liveBundles.get(key);
  if (cached && Date.now() - cached.started < 60_000) return cached.result;
  const result = (async () => {
    const response = await fetch(`${LIVE_ROOT}/live-${source}/${version}.json`, { signal: AbortSignal.timeout(2_500) });
    if (!response.ok) return null;
    const entry = await response.json();
    if (entry?.source !== source || entry.season !== 18 || entry.version !== version ||
      !Number.isFinite(Date.parse(entry.updatedAt))) return null;
    const mandatory = source === 'dataj' ? ['game-catalog', 'rankings'] : ['compositions'];
    for (const dataset of mandatory) {
      const spec = [...snapshots.values()].find(row => row[0] === dataset && row[1] === source && row[2] === version);
      if (!spec || !validPayload(entry.datasets?.[dataset], source, version, spec[3])) return null;
    }
    return entry;
  })().catch(() => null);
  liveBundles.set(key, { result, started: Date.now() });
  return result;
}

async function readBundled(paths, specs, optional, signal) {
  const values = await Promise.all(paths.map(async (path, index) => {
    if (!path) return null;
    try {
      const payload = await loadJson(path, { signal });
      const spec = specs[index];
      if (spec && !validPayload(payload, spec[1], spec[2], spec[3])) throw new Error(`数据快照校验失败 ${path}`);
      return payload;
    } catch (error) {
      if (optional.includes(path)) return null;
      throw error;
    }
  }));
  return { values, location: 'bundled' };
}

export async function loadCatalogBundle(paths, { optional = [], live = false } = {}) {
  const specs = paths.map(path => snapshots.get(path));
  if (!paths.length || !specs.every(Boolean)) return readBundled(paths, specs, optional);

  const pending = new AbortController();
  const database = readDatabase(specs, pending.signal).then(values => {
    if (!values) throw new Error('备用数据不完整');
    return { values, location: 'database' };
  });
  const fallback = Promise.any([database, readBundled(paths, specs, optional, pending.signal)])
    .catch(error => { throw error.errors.at(-1); });
  let timer;
  try {
    if (!live) return await fallback;
    const latest = loadLiveBundle(specs).then(entry => {
      if (!entry) throw new Error('自动同步快照不可用');
      const values = specs.map(([dataset, source, version, accepts]) => {
        const payload = entry.datasets[dataset];
        return validPayload(payload, source, version, accepts) ? { ...payload, extractedAt: entry.updatedAt } : null;
      });
      if (!values.every((value, index) => value || optional.includes(paths[index]))) throw new Error('自动同步快照不完整');
      return { values, location: 'live', updatedAt: entry.updatedAt };
    });
    // Prefer a fresh snapshot during a short window, then show the first complete fallback.
    const grace = new Promise(resolve => { timer = setTimeout(resolve, 1_200); });
    const readyFallback = Promise.all([fallback, Promise.race([grace, latest.catch(() => {})])]).then(([bundle]) => bundle);
    return await Promise.any([latest, readyFallback]);
  } catch (error) {
    throw error.errors?.at(-1) || error;
  } finally {
    clearTimeout(timer);
    pending.abort();
  }
}
