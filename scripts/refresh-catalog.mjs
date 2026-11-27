import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { adaptBoard, sourceFor } from '../src/adapters/board-sources.js';
import { datajTeamCodes } from '../src/data/s18.18.7.dataj-team-codes.js';
import { buildDatajCatalog } from './import-dataj-catalog.mjs';

const DATAJ = 'https://www.dataj.cc';
const TFT_TEAM = 'https://api.datatft.com/team/list';
const version = '18.7';
const season = 18;
const readData = async path => JSON.parse(await readFile(new URL('../src/data/' + path, import.meta.url), 'utf8'));

export function datajRows(html) {
  for (const match of html.matchAll(/self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g)) {
    const [, value] = JSON.parse(match[1]);
    if (typeof value !== 'string') continue;
    const marker = '"initialRows":';
    const start = value.indexOf(marker);
    const end = value.indexOf('],"initialSetId":', start);
    if (start === -1 || end === -1) continue;
    const stamp = value.slice(end + 1).match(/^,"initialSetId":(\d+),"initialGameVersion":"([^"]+)"/);
    if (!stamp || Number(stamp[1]) !== season || stamp[2] !== version) throw new Error('DataJ page version mismatch');
    return JSON.parse(value.slice(start + marker.length, end + 1));
  }
  throw new Error('DataJ statistics rows missing');
}

const stats = (row, appear) => ({
  appear, first: row.topRate, top4: row.top4Rate, avg: row.avgPlacement, samples: row.sampleCount,
});

export function datajRankings(comps, items, augments, catalogItems = []) {
  const itemNames = new Map([
    ...catalogItems.map(row => [row.id.slice('jcc-item:'.length), row.name]),
    ...items.map(row => [String(row.equipId), row.name]),
  ]);
  return {
    source: 'dataj.cc', season, version,
    pages: { comps: DATAJ + '/comp', items: DATAJ + '/equip', augments: DATAJ + '/hex' },
    comps: comps.map(row => ({
      id: String(row.compId), title: row.name, stats: { tier: row.tier, ...stats(row, row.pickRate) },
      heroes: row.heroes.map(hero => ({
        id: String(hero.heroId), name: hero.heroName, carry: Boolean(hero.isCarry),
        core: Boolean(hero.isCore), summon: hero.heroType !== 0,
        stars: hero.heroStarNum,
        items: (row.equips || []).filter(item => String(item.compHeroId) === String(hero.id))
          .map(item => itemNames.get(String(item.equipId))).filter(Boolean),
      })),
    })),
    items: items.map(row => ({
      id: String(row.equipId), name: row.name, icon: row.picture, ...stats(row, row.playRate),
    })),
    augments: augments.map(row => ({
      id: String(row.hexId), name: row.name, icon: row.icon, ...stats(row, row.playRate), roundStats: row.roundStats,
    })),
  };
}

async function request(url, init) {
  let failure;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(35_000) });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.text();
    } catch (error) {
      failure = error;
    }
  }
  throw new Error(new URL(url).host + new URL(url).pathname + ': ' + failure.message);
}

async function refreshDataj() {
  const [comps, items, augments, raw] = await Promise.all([
    ...['comp', 'equip', 'hex'].map(page => request(DATAJ + '/' + page).then(datajRows)),
    request(DATAJ + '/api/web/gamedata?setId=18').then(JSON.parse),
  ]);
  const catalog = buildDatajCatalog(raw, datajRankings(comps, items, augments));
  const rankings = datajRankings(comps, items, augments, catalog.items);
  const icons = new Map(catalog.units.map(unit => [unit.id, unit.icon]));
  const baseline = await readData('dataj/s18.18.7.json');
  const lineupKey = comp => comp.heroes.filter(hero => !hero.summon && hero.id !== '8702').map(hero => hero.id).sort().join(',');
  const previous = new Map(baseline.comps.map(comp => [comp.id, lineupKey(comp)]));
  for (const comp of rankings.comps) {
    comp.teamCode = previous.get(comp.id) === lineupKey(comp) ? datajTeamCodes[comp.id] || '' : '';
    for (const hero of comp.heroes) hero.icon = icons.get('jcc-unit:' + hero.id);
  }
  return { 'game-catalog': catalog, rankings };
}

async function refreshTft() {
  const body = JSON.stringify({ version, season: String(season), tier: 'diamond', time: 5 });
  const result = JSON.parse(await request(TFT_TEAM, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://www.datatft.com', referer: 'https://www.datatft.com/' },
    body,
  }));
  assert.equal(result.success, true, 'DataTFT team list request failed');
  assert.ok(Number(result.data?.count) > 0 && Array.isArray(result.data?.list), 'DataTFT team list incomplete');
  const baseline = await readData('datatft/s18.18.7.comps.json');
  return { compositions: {
    source: 'datatft.com', season, version, pages: baseline.pages, samples: Number(result.data.count), comps: result.data.list,
  } };
}

export async function validateUpdate(source, datasets) {
  const native = source === 'dataj';
  const raw = datasets[native ? 'rankings' : 'compositions'];
  const items = native ? datasets['game-catalog'] : await readData('set18.items.json');
  const roster = native ? items : await readData('set18.json');
  const prior = await readData(native ? 'dataj/s18.18.7.json' : 'datatft/s18.18.7.comps.json');
  assert.equal(raw?.source, sourceFor(source).host);
  assert.equal(raw?.season, season);
  assert.equal(raw?.version, version);
  assert.ok(raw.comps.length >= Math.ceil(prior.comps.length * 0.7), 'Array smaller than the release baseline');
  assert.equal(new Set(raw.comps.map(row => String(row.id))).size, raw.comps.length, 'Duplicate team IDs');
  const setData = { ...roster, set: season, scope: { sourceId: source, version } };
  const { comps } = adaptBoard(raw, { source, setData, items });
  assert.equal(comps.length, raw.comps.length, 'Lineup contains heroes outside the release catalog');
  assert.ok(comps.every(row => row.name && Number.isFinite(row.rank.top4)), 'Lineup statistics incomplete');
  if (native) {
    assert.equal(items.source, 'dataj.cc');
    assert.equal(items.season, season);
    assert.equal(items.version, version);
    assert.ok(raw.items.length >= prior.items.length * 0.7 && raw.augments.length >= prior.augments.length * 0.7,
      'Equipment or augment statistics incomplete');
    const old = await readData('dataj/s18.18.7.catalog.json');
    for (const key of ['units', 'traits', 'components', 'items', 'augments']) {
      assert.ok(items[key].length >= old[key].length * 0.7, 'Incomplete DataJ catalog: ' + key);
    }
  }
}

async function main() {
  const [source, output, previous] = process.argv.slice(2);
  assert.ok(output && ['dataj', 'datatft'].includes(source), 'Usage: node scripts/refresh-catalog.mjs <dataj|datatft> <output> [previous]');
  const datasets = await (source === 'dataj' ? refreshDataj() : refreshTft());
  await validateUpdate(source, datasets);
  const digest = createHash('sha256').update(JSON.stringify(datasets)).digest('hex');
  const prior = previous && await readFile(previous, 'utf8').then(JSON.parse).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  const updatedAt = prior?.digest === digest ? prior.updatedAt : new Date().toISOString();
  await writeFile(output, JSON.stringify({ source, season, version, updatedAt, digest, datasets }) + '\n');
  console.log(source + ' ' + version + ' · ' + (datasets.rankings || datasets.compositions).comps.length + ' lineups · ' + updatedAt);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
