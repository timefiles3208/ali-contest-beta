import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

export function buildDatajCatalog(raw, rankings) {
  assert.ok(raw.success && raw.data);
  assert.equal(rankings.source, 'dataj.cc');
  assert.equal(rankings.season, 18);
  assert.equal(rankings.version, '18.7');
  // The public API uses setId for the ruleset, 18.18.x for change versions,
  // and a leading 1 on hero IDs for the variant matched by the 18.7 statistics.
  const release = row => {
    const version = String(row.version).match(/^18\.18\.(\d+)[a-z]?$/);
    return String(row.setId) === '18' && version && Number(version[1]) <= 7;
  };
  const png = url => {
    const parsed = new URL(url);
    assert.ok(parsed.protocol === 'https:' && ['img.dataj.cc','game.gtimg.cn'].includes(parsed.hostname));
    return parsed.href;
  };
  const traitKey = id => 'jcc-trait:' + id;
  const itemKey = id => 'jcc-item:' + id;
  const { hero, trait, equip, hex } = raw.data;
  const traits = trait.filter(row => release(row) && row.level === 1).map(row => ({
    id: traitKey(row.checkId), name: row.name, icon: png(row.picture),
    tiers: row.numList.split('|').map(Number).filter(n => Number.isInteger(n) && n > 0).map(min => ({ min })),
  }));
  const traitIds = new Set(traits.map(x => x.id));
  const units = hero.filter(row => release(row) && /^1\d{4}$/.test(row.id) && row.isVisible && row.heroType === 0 && row.price > 0)
    .map(row => ({
      id: 'jcc-unit:' + String(row.id).slice(1), name: row.name, cost: row.price, icon: png(row.picture),
      traits: [...new Set([row.raceId, row.jobId].flatMap(x => String(x).split('|')).map(traitKey).filter(id => traitIds.has(id)))],
    })).filter(unit => unit.traits.length);
  assert.equal(new Set(units.map(u => u.id)).size,units.length);
  const unitIds = new Set(units.map(x=>x.id));
  for (const comp of rankings.comps) {
    for (const unit of comp.heroes.filter(x=>!x.summon && x.id!=='8702')) assert.ok(unitIds.has('jcc-unit:'+unit.id),unit.name+' '+unit.id);
  }
  const classification = {'基础装备':'component','成型装备':'completed','光明武器':'radiant','神器装备':'artifact','转职纹章':'emblem','特殊装备':'special'};
  const knownEquip = equip.filter(row => release(row)&&classification[row.type]);
  const knownIds = new Set(knownEquip.map(row=>String(row.id)));
  const completeByName = new Map(knownEquip.filter(x=>x.type==='成型装备').map(x=>[x.name,x.id]));
  const items = knownEquip.map(row=>{
    const kind=classification[row.type];
    const base=kind==='radiant' ? completeByName.get(row.name.replace(/^光明版/,'')) : undefined;
    const emblem=kind==='emblem' ? traits.find(x=>row.name===x.name+'纹章') : null;
    const from=[row.synthesis1,row.synthesis2].map(String);
    return { id:itemKey(row.id),name:row.name,kind,icon:png(row.picture),desc:row.descText||'',
      from:from.every(id=>knownIds.has(id))?from.map(itemKey):[],
      ...(base&&{baseId:itemKey(base)}), ...(emblem&&{trait:emblem.id}) };
  });
  const tier = {1:'silver',2:'gold',3:'prismatic'};
  const augments = hex.filter(row=>release(row)&&tier[row.level]).map(row=>{
   const desc = row.descText || '';
   // Sources do not always fill fetterId; exact trait names in the description supply text-only evidence.
   const mentionsTraits = traits.filter(t=>desc.includes(t.name)).map(t=>t.name);
   const grantTraits = traits.filter(t=>new RegExp('获得[^。；，]{0,8}(?:个)?[【〖]?'+t.name+'纹章').test(desc)).map(t=>t.id);
   return {id:'jcc-augment:'+tier[row.level]+':'+row.id,name:row.name,desc,icon:png(row.icon),mentionsTraits,grantTraits};
  });
  const payload={source:'dataj.cc',season:18,version:'18.7',api:'https://www.dataj.cc/api/web/gamedata?setId=18',
   costs:[...new Set(units.map(x=>x.cost))].sort((a,b)=>a-b),units,traits,
   components:items.filter(x=>x.kind==='component'),items:items.filter(x=>x.kind!=='component'),augments};
  for(const key of ['units','traits','components','items','augments']) assert.ok(payload[key].length,key);
  return payload;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, rankingsPath, output] = process.argv.slice(2);
  if (!input || !rankingsPath || !output) throw new Error('用法：node scripts/import-dataj-catalog.mjs <gamedata.json> <rankings.json> <output.json>');
  const read = path => JSON.parse(readFileSync(path, 'utf8'));
  const payload = buildDatajCatalog(read(input), read(rankingsPath));
  writeFileSync(output, JSON.stringify(payload) + '\n', 'utf8');
}
