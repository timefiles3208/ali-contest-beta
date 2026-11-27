import { datajTeamCodes } from '../data/s18.18.7.dataj-team-codes.js';

export const BOARD_SOURCES = [
  { id: 'datatft', season: 18, version: '18.7', host: 'datatft.com', game: '云顶之弈', file: './src/data/datatft/s18.18.7.comps.json', ratingsFile: './src/data/datatft/s18.18.7.ratings.json' },
  { id: 'dataj', season: 18, version: '18.7', catalogFile: './src/data/dataj/s18.18.7.catalog.json', host: 'dataj.cc', game: '金铲铲之战', file: './src/data/dataj/s18.18.7.json' },
];

export const sourceFor = (id) => BOARD_SOURCES.find((source) => source.id === id) || BOARD_SOURCES[0];

const normalize = (name) => String(name ?? '').normalize('NFKC').replace(/\s/g, '');
const itemAliases = { 锐利之刃: '死亡之刃' };
const round = (x) => Number.isFinite(x) ? x : null;

export function adaptBoard(raw, { source, setData, items, ratings }) {
  const config = sourceFor(source);
  if (raw?.source !== config.host) throw new Error('数据源标识不匹配');
  if (raw.season !== setData.set || raw.version !== config.version || (setData.scope &&
    (setData.scope.sourceId !== config.id || setData.scope.version !== raw.version))) throw new Error('榜单与所选游戏版本不匹配');
  if (ratings && (ratings.source !== raw.source || ratings.season !== raw.season || ratings.version !== raw.version)) {
    throw new Error('评级数据源或版本不匹配');
  }

  const byId = new Map(setData.units.map((unit) => [unit.id, unit]));
  const unitByName = new Map();
  for (const unit of setData.units) {
    const name = normalize(unit.name);
    unitByName.set(name, unitByName.has(name) && setData.scope?.sourceId === 'dataj' ? null : unit);
  }
  const itemByName = new Map((items?.items || []).map((item) => [normalize(item.name), item.id]));
  const itemIds = new Set(itemByName.values());
  // DataJ S18 can export the split Krug with heroType 0, like a shop unit.
  const isSmallKrug = hero => source === 'dataj' && raw.season === 18
    && (String(hero.id) === '8702' || (hero.id == null && normalize(hero.name) === '小型石甲虫'));
  const comps = [];
  const skipped = [];
  for (const row of raw.comps || []) {
    const entries = (row.heroes || row.heros || []).filter((hero) => !hero.summon && !isSmallKrug(hero)).map((hero) => {
      const unit = setData.scope?.sourceId === 'dataj'
        ? (hero.id == null ? unitByName.get(normalize(hero.name)) : byId.get('jcc-unit:' + hero.id))
        : hero.key ? byId.get(hero.key) : unitByName.get(normalize(hero.name));
      const gear = hero.tftEquips || (hero.items || []).map((name) =>
        itemByName.get(normalize(name)) || itemByName.get(normalize(itemAliases[name])));
      const stars = Number.isInteger(hero.stars) && hero.stars >= 1 && hero.stars <= 4 ? hero.stars : null;
      return { unit, gear: gear.filter(id => itemIds.has(id)), core: hero.core, carry: hero.carry, stars };
    });
    if (!entries.length || entries.some(({ unit }) => !unit)) {
      skipped.push(row.title);
      continue;
    }
    const units = [...new Set(entries.map(({ unit }) => unit.id))];
    const carry = entries.filter((entry) => entry.carry).map(({ unit }) => unit.id);
    if (!carry.length && row.heroId) {
      const lead = row.heros?.find((hero) => String(hero.id) === String(row.heroId))?.key;
      if (lead && units.includes(lead)) carry.push(lead);
    }
    const core = entries.filter((entry) => entry.core).map(({ unit }) => unit.id);
    const itemBuilds = Object.fromEntries(entries.filter(entry => entry.gear.length).map(({ unit, gear }) => [unit.id, gear]));
    const gear = Object.fromEntries(Object.entries(itemBuilds).map(([id, build]) => [id, [...new Set(build)]]));
    const stars = Object.fromEntries(entries.filter(entry => entry.stars).map(({ unit, stars }) => [unit.id, stars]));
    const counts = new Map();
    for (const id of units) for (const trait of byId.get(id).traits || []) counts.set(trait, (counts.get(trait) || 0) + 1);
    const aimTraits = {};
    for (const trait of setData.traits || []) {
      const level = Math.max(0, ...(trait.tiers || []).map((tier) => tier.min).filter((min) => min <= (counts.get(trait.id) || 0)));
      if (level) aimTraits[trait.id] = level;
    }
    const stats = row.stats || { tier: row.tier, appear: row.playRate, first: row.won, top4: row.top4, avg: row.place };
    const top4 = round(stats.top4);
    const geared = Object.keys(gear);
    const main = core.length ? core : [...carry, ...geared].slice(0, 4);
    comps.push({
      id: `${config.id}-${row.id}`, name: row.title, units, items: gear, itemBuilds, stars, aimTraits, traits: Object.keys(aimTraits),
      core: [...new Set(main.length ? main : units.slice(0, 2))],
      carry: [...new Set(carry)], level: Math.min(10, units.length),
      teamCode: source === 'dataj' && raw.version === '18.7' ? (row.teamCode ?? datajTeamCodes[row.id] ?? '')
        : source === 'datatft' && typeof row.tftCode === 'string' ? row.tftCode : '',
      strength: top4 == null ? 0.7 : Math.max(0.55, Math.min(0.85, 0.7 + (top4 - 55) * 0.012)),
      rank: {
        source: config.host, boardTitle: row.title, tier: stats.tier || null,
        appear: round(stats.appear), first: round(stats.first), top4, avg: round(stats.avg), samples: round(stats.samples),
      },
    });
  }
  const keyed = (rows) => new Map((rows || []).map((row) => [normalize(itemAliases[row.name] || row.name), row]));
  return {
    comps, skipped, version: raw.version, extractedAt: raw.extractedAt,
    items: keyed(raw.items || ratings?.ratings?.items), augments: keyed(raw.augments || ratings?.ratings?.augments),
  };
}

export function boardStat(index, name) {
  const row = index?.get(normalize(name));
  if (row?.rating) return `评级 ${row.rating}`;
  return Number.isFinite(row?.top4) ? `前四 ${row.top4}%` : '';
}

export function summarizeBoard(comps) {
  const traits = new Map();
  const gear = new Map();
  for (const comp of comps) {
    if (comp.rank.top4 != null) for (const id of Object.keys(comp.aimTraits)) {
      const entry = traits.get(id) || { id, boards: 0, top4: 0 };
      entry.boards++;
      entry.top4 += comp.rank.top4;
      traits.set(id, entry);
    }
    for (const [unitId, items] of Object.entries(comp.items)) {
      const counts = gear.get(unitId) || new Map();
      for (const id of items) counts.set(id, (counts.get(id) || 0) + 1);
      gear.set(unitId, counts);
    }
  }
  return {
    traits: [...traits.values()].map(({ id, boards, top4 }) => ({ id, boards, avgTop4: Math.round(top4 / boards * 10) / 10 })),
    bis: [...gear].map(([unitId, counts]) => ({
      unitId,
      items: [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a)).slice(0, 3),
    })),
  };
}
