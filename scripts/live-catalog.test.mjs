import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { datajRows, datajRankings, validateUpdate } from './refresh-catalog.mjs';
import { loadCatalogBundle } from '../src/adapters/catalog.js';

const read = path => JSON.parse(readFileSync(new URL('../src/data/' + path, import.meta.url)));
const compositions = read('datatft/s18.18.7.comps.json');
const rankings = read('dataj/s18.18.7.json');
const catalog = read('dataj/s18.18.7.catalog.json');
const timestamp = '2026-11-27T02:42:00.000Z';
const dataj = { source: 'dataj', season: 18, version: '18.7', updatedAt: timestamp,
  datasets: { rankings, 'game-catalog': catalog } };

function page(rows, set, patch) {
  const flight = JSON.stringify([1, JSON.stringify({ initialRows: rows, initialSetId: set, initialGameVersion: patch })]);
  return '<script>self.__next_f.push(' + flight + ')</script>';
}

test('starts the full local fallback while remote release requests are pending', async t => {
  const { loadCatalogBundle: loadFresh } = await import('../src/adapters/catalog.js?parallel-fallback');
  const requests = [];
  let releaseRemote;
  const remote = new Promise(resolve => { releaseRemote = resolve; });
  t.mock.method(globalThis, 'fetch', async url => {
    const path = String(url);
    requests.push(path);
    if (path.startsWith('https://')) return remote;
    return Response.json(path.endsWith('.catalog.json') ? catalog : rankings);
  });
  const paths = ['./src/data/dataj/s18.18.7.catalog.json', './src/data/dataj/s18.18.7.json'];
  const loading = loadFresh(paths, { live: true });
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(paths.every(path => requests.includes(path)));
    assert.ok(requests.some(path => path.includes('supabase.co')));
    const result = await loading;
    assert.equal(result.location, 'bundled');
    assert.deepEqual(result.values, [catalog, rankings]);
    releaseRemote(Response.json(dataj));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(result.location, 'bundled');
  } finally {
    releaseRemote(new Response(null, { status: 503 }));
    await loading.catch(() => {});
  }
});

test('a late verified snapshot is cached for the next load without changing the current result', async t => {
  const { loadCatalogBundle: firstLoad } = await import('../src/adapters/catalog.js?cache-miss');
  const { loadCatalogBundle: nextLoad } = await import('../src/adapters/catalog.js?cache-hit');
  const cache = new Map();
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: {
    async open() {
      return {
        async match(url) { return cache.get(url)?.clone(); },
        async put(url, response) { cache.set(url, response); },
      };
    },
  } });
  t.after(() => { delete globalThis.caches; });
  let finish;
  const online = new Promise(resolve => { finish = resolve; });
  t.mock.method(globalThis, 'fetch', async url => {
    const path = String(url);
    if (path.includes('raw.githubusercontent.com')) return online.then(response => response.clone());
    if (path.includes('supabase.co')) return new Response(null, { status: 503 });
    return Response.json(path.endsWith('.catalog.json') ? catalog : rankings);
  });
  const paths = ['./src/data/dataj/s18.18.7.catalog.json', './src/data/dataj/s18.18.7.json'];
  const result = await firstLoad(paths, { live: true });
  assert.equal(result.location, 'bundled');
  finish(Response.json(dataj));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(cache.size, 1);
  assert.equal(result.location, 'bundled');
  const fresh = await nextLoad(paths, { live: true });
  assert.equal(fresh.location, 'live');
  assert.equal(fresh.updatedAt, timestamp);
});

test('DataJ only parses a ranking page carrying the exact game version', () => {
  const rows = [{ compId: '85', heroes: [] }];
  assert.deepEqual(datajRows(page(rows, 18, '18.7')), rows);
  assert.throws(() => datajRows(page(rows, 18, '18.6')), /version mismatch/);
  assert.throws(() => datajRows(page(rows, 19, '18.7')), /version mismatch/);
  assert.throws(() => datajRows('<html>empty</html>'), /rows missing/);
});

test('preserves separate source equipment and augments and rejects partial or foreign teams', async () => {
  const comp = { compId: 1, name: '队伍', heroes: [{ id: 'a', heroId: 4511, heroName: '阿狸', heroType: 0, isCarry: true }],
    equips: [{ compHeroId: 'a', equipId: 42 }, { compHeroId: 'a', equipId: 42 }] };
  const mapped = datajRankings([comp], [{ equipId: 42, name: '装备' }], [{ hexId: 43, name: '海克斯' }]);
  assert.deepEqual(mapped.comps[0].heroes[0].items, ['装备', '装备']);
  assert.equal(mapped.augments[0].id, '43');
  await validateUpdate('dataj', dataj.datasets);
  await assert.rejects(validateUpdate('dataj', { ...dataj.datasets, rankings: { ...rankings, comps: [] } }), /baseline/);
  await assert.rejects(validateUpdate('datatft', { compositions: rankings }));
  await validateUpdate('datatft', { compositions });
});

test('validates the full DataJ bundle before use and falls back without mixing catalogs', async t => {
  const path = './src/data/dataj/s18.18.7.catalog.json';
  const fallback = { dataset: 'game-catalog', source: 'dataj', season: 18, version: '18.7', payload: catalog };
  const { loadCatalogBundle: loadFresh } = await import('../src/adapters/catalog.js?invalid-live');
  const fetch = t.mock.method(globalThis, 'fetch', async url => {
    if (String(url).includes('raw.githubusercontent.com')) {
      return Response.json({ ...dataj, datasets: { ...dataj.datasets, rankings: { ...rankings, version: '18.6' } } });
    }
    return String(url).includes('supabase.co') ? Response.json([fallback]) : new Response(null, { status: 404 });
  });
  assert.deepEqual(await loadFresh([path], { live: true }), { values: [catalog], location: 'database' });
  assert.equal(fetch.mock.callCount(), 3);
});

test('loads the native DataJ release from one shared request and keeps optional DataTFT ratings empty', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async url => {
    if (String(url).endsWith('live-dataj/18.7.json')) return Response.json(dataj);
    if (String(url).endsWith('live-datatft/18.7.json')) {
      return Response.json({ ...dataj, source: 'datatft', datasets: { compositions } });
    }
    return new Response(null, { status: 404 });
  });
  const options = { live: true };
  assert.equal((await loadCatalogBundle(['./src/data/dataj/s18.18.7.catalog.json'], options)).location, 'live');
  assert.equal((await loadCatalogBundle(['./src/data/dataj/s18.18.7.json'], options)).values[0].extractedAt, timestamp);
  assert.equal(fetch.mock.calls.filter(call => String(call.arguments[0]).endsWith('live-dataj/18.7.json')).length, 1);
  const tier = './src/data/datatft/s18.18.7.ratings.json';
  const tft = await loadCatalogBundle(['./src/data/datatft/s18.18.7.comps.json', tier], { ...options, optional: [tier] });
  assert.equal(tft.location, 'live');
  assert.equal(tft.values[1], null);
});
