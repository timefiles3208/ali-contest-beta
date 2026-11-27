import { loadJson } from '../ui/helpers.js?v=fast-catalog';

const LIVE_ROOT = 'https://raw.githubusercontent.com/timefiles3208/ali-contest-beta';
const liveBundles = new Map();
const LIVE_CACHE = 'tft-live-catalog';
const BACKUP_DATASET = 'recommendation-release';

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

const releaseDatasets = {
  datatft: ['units-traits', 'items', 'augments', 'compositions'],
  dataj: ['game-catalog', 'rankings'],
};

function releaseSpecs(source) {
  return releaseDatasets[source]?.map(dataset => [...snapshots.values()].find(([name, id]) =>
    name === dataset && (id === source || (source === 'datatft' && id === 'riot'))));
}

export function validReleaseDatasets(source, datasets) {
  return releaseSpecs(source)?.every(([dataset, id, version, accepts]) =>
    validPayload(datasets?.[dataset], id, version, accepts)) === true;
}

async function fetchDatabase(query, signal) {
  const url = new URL(API);
  url.search = new URLSearchParams(query).toString();
  const response = await fetch(url, {
    credentials: 'omit',
    headers: { apikey: PUBLISHABLE_KEY },
    signal: AbortSignal.any([signal, AbortSignal.timeout(3_500)]),
  });
  return response.ok ? response.json() : null;
}

async function readDatabase(specs, signal) {
  const clauses = specs.map(([dataset, source, version]) =>
    `and(dataset.eq.${dataset},source.eq.${source},season.eq.18,version.eq.${version})`);
  const rows = await fetchDatabase({
    select: 'dataset,source,season,version,payload',
    or: `(${clauses.join(',')})`,
  }, signal);
  if (!Array.isArray(rows) || rows.length !== specs.length) return null;
  const values = specs.map(([dataset, source, version, accepts]) => {
    const row = rows.find(row => row?.dataset === dataset && row.source === source && row.version === version && row.season === 18);
    return validPayload(row?.payload, source, version, accepts) ? row.payload : null;
  });
  return values.every(Boolean) ? values : null;
}

function releaseScope(specs) {
  const rankingSpec = specs.find(([, id]) => Object.hasOwn(releaseDatasets, id));
  if (!rankingSpec) return null;
  const [, source, version] = rankingSpec;
  const compatible = specs.every(([, id, release]) =>
    (id === source && release === version) || (source === 'datatft' && id === 'riot' && release === '16.23.1'));
  return compatible ? { source, version } : null;
}

function validReleaseEntry(entry, { source, version }) {
  return entry?.source === source && entry.season === 18 && entry.version === version &&
    Number.isFinite(Date.parse(entry.updatedAt)) && validReleaseDatasets(source, entry.datasets);
}

async function readReleaseBackup(scope, signal) {
  if (!scope) return null;
  const { source, version } = scope;
  const rows = await fetchDatabase({
    select: 'dataset,source,season,version,payload,content_sha256',
    dataset: 'eq.' + BACKUP_DATASET,
    source: 'eq.' + source,
    season: 'eq.18',
    version: 'eq.' + version,
  }, signal);
  if (!Array.isArray(rows) || rows.length !== 1) return null;
  const [row] = rows;
  if (row?.dataset !== BACKUP_DATASET || row.source !== source || row.season !== 18 || row.version !== version ||
      !/^[a-f0-9]{64}$/.test(row.content_sha256) || row.content_sha256 !== row.payload?.digest) return null;
  return validReleaseEntry(row.payload, scope) ? row.payload : null;
}

async function loadLiveBundle(scope) {
  if (!scope) return null;
  const { source, version } = scope;
  const key = source + '/' + version;
  const cached = liveBundles.get(key);
  if (cached && Date.now() - cached.started < 60_000) return cached.result;
  const url = `${LIVE_ROOT}/live-${source}/${version}.json`;
  const validate = entry => validReleaseEntry(entry, scope) ? entry : null;
  const browserCache = globalThis.caches?.open(LIVE_CACHE).catch(() => null);
  const stored = browserCache?.then(async cache => {
    const response = await cache?.match(url);
    const entry = response && validate(await response.json());
    if (!entry) throw new Error('无可用缓存快照');
    return entry;
  });
  const network = (async () => {
    const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    const entry = response.ok ? validate(await response.json()) : null;
    if (!entry) throw new Error('无可用同步快照');
    const previous = await stored?.catch(() => null);
    if (previous && Date.parse(previous.updatedAt) >= Date.parse(entry.updatedAt)) return previous;
    void browserCache?.then(cache => cache?.put(url, Response.json(entry))).catch(() => {});
    liveBundles.set(key, { result: Promise.resolve(entry), started: Date.now() });
    return entry;
  })();
  const result = Promise.any(stored ? [stored, network] : [network]).catch(() => null);
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
  const scope = live ? releaseScope(specs) : null;
  const unpack = (entry, location) => {
    if (!entry) throw new Error('发布批次不可用');
    const values = specs.map(([dataset, source, version, accepts]) => {
      const payload = entry.datasets[dataset];
      return validPayload(payload, source, version, accepts) ? { ...payload, extractedAt: entry.updatedAt } : null;
    });
    if (!values.every((value, index) => value || optional.includes(paths[index]))) throw new Error('发布批次不完整');
    return { values, location, updatedAt: entry.updatedAt, revision: entry.digest };
  };
  const database = live
    ? readReleaseBackup(scope, pending.signal).then(entry => unpack(entry, 'database'))
    : readDatabase(specs, pending.signal).then(values => {
      if (!values) throw new Error('备用数据不完整');
      return { values, location: 'database' };
    });
  const fallback = Promise.any([database, readBundled(paths, specs, optional, pending.signal)])
    .catch(error => { throw error.errors.at(-1); });
  let timer;
  try {
    if (!live) return await fallback;
    const latest = loadLiveBundle(scope).then(entry => unpack(entry, 'live'));
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
