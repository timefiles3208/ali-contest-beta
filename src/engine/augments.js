// 海克斯打分：官方数据只给了描述文本，没有强度分层，所以这里只做「跟你现在这局有多贴」的匹配，
// 外加一层按关键词分类的通用先验(人工标注，不是实时胜率)。
import { traitBreakdown } from './recommend.js';

const CATEGORY_RULES = [
  ['item', /装备|组件|散件|成品|锻造|器械|冠冕/, 0.12],
  ['econ', /金币|利息|经济|连败|连胜|经验|刷新/, 0.14],
  ['combat', /伤害|护盾|治疗|攻击速度|法术|抗性|暴击|法力|生命值|加成/, 0.12],
  ['core', /核心|英雄强化|专属|升星|三星/, 0.1],
  ['trait', /纹章|羁绊|凑出/, 0.16],
];

// 「羁绊」这一类只有真的绑定了羁绊 id 才算，否则只是提到「羁绊」二字的海克斯会被误分类。
export function categorize(aug, linkedCount = 0) {
  const text = `${aug.name} ${aug.desc}`;
  let best = { id: 'other', prior: 0.04 };
  let hits = 0;
  // 一条描述里往往同时出现「羁绊」和「装备」，取命中次数最多的类别，而不是第一条命中的规则。
  for (const [id, re, prior] of CATEGORY_RULES) {
    if (id === 'trait' && !linkedCount) continue;
    const n = (text.match(new RegExp(re.source, 'g')) || []).length;
    if (n > hits) {
      hits = n;
      best = { id, prior };
    }
  }
  return best;
}

export const CATEGORY_LABEL = { trait: '羁绊', core: '强化', item: '装备', econ: '经济', combat: '战力', other: '通用' };

function economyBenefits(text) {
  return {
    grantsXP: /(?<!无法|不能|不会|不再)(?:获得|提供)[^。；，！\n]{0,14}经验|(?:升级|购买经验)[^。；，！\n]{0,8}(?:更便宜|少花|减少)/.test(text),
    grantsGold: /(?<!无法|不能|不会|不再)(?:获得|提供)[^。；，！\n]{0,16}(?:金币|利息)/.test(text),
    grantsRolls: /(?<!无法|不能|不会|不再)免费(?:的)?(?:商店)?刷新|刷新(?:的)?(?:价格|花费|费用)[^。；，！\n]{0,6}(?:减少|降低)/.test(text),
  };
}

function economyFit(economy, comp, reroll, { grantsXP, grantsGold, grantsRolls }) {
  if (economy === 'low') {
    if (grantsGold) return { points: 0.17, reason: '经济紧张 · 补金币' };
    if (grantsRolls) return { points: 0.13, reason: '经济紧张 · 免费刷新可省金币' };
  }
  if (economy === 'high' && !reroll && (comp?.level || 0) >= 8 && grantsXP) {
    return { points: 0.17, reason: `经济充足 · 补经验，支持 ${comp.level} 人口阵容` };
  }
  if (reroll && grantsRolls && economy) return { points: 0.12, reason: '目标追低费棋子 · 免费刷新有助于搜牌' };
  return null;
}

const normalizeName = value => String(value ?? '').normalize('NFKC').replace(/\s/g, '');

function equipmentContext(comp, itemsData, owned, ownedItems) {
  const itemRows = [...(itemsData?.items || []), ...(itemsData?.components || [])];
  const byId = new Map(itemRows.map(item => [item.id, item]));
  const byName = new Map(itemRows.map(item => [normalizeName(item.name), item.id]));
  const wanted = new Set(Object.values(comp?.items || {}).flat());
  const gaps = [];
  for (const id of wanted) {
    if (ownedItems.has(id)) continue;
    const item = byId.get(id);
    if (!item?.from?.length) continue;
    const remaining = new Map(owned);
    const missing = item.from.filter(part => {
      const count = remaining.get(part) || 0;
      if (count) remaining.set(part, count - 1);
      return !count;
    });
    if (missing.length === 1 && item.from.length > 1) gaps.push({ missing: missing[0], item: item.name });
  }
  return { byId, byName, wanted, gaps };
}

function citySynergy(aug, city, comp, { hitItems, hitTraits, hitCore, benefits }) {
  if (!city || city.effect === 'neutral') return null;
  const text = aug.desc || '';
  const { grantsXP, grantsGold, grantsRolls } = benefits;
  const high = (comp?.level || 0) >= 8;
  switch (city.effect) {
    case 'level':
      return grantsXP ? { points: high ? 0.19 : 0.16, reason: '补经验，配合较低的升级成本' } : null;
    case 'gold':
      if (high && grantsXP) return { points: 0.18, reason: '用额外经济配合升人口' };
      if (grantsGold) return { points: 0.14, reason: '增加可用于升级和搜牌的金币' };
      return grantsRolls ? { points: 0.1, reason: '节省刷新金币，保留城邦给的经济' } : null;
    case 'rerolls':
      return grantsRolls ? { points: high ? 0.12 : 0.18, reason: '叠加免费刷新，帮助搜到目标棋子' } : null;
    case 'early':
      if (hitCore.length || aug.grantUnits?.length) return { points: 0.16, reason: '补充开局棋子，帮助过渡或升星' };
      return hitTraits.length ? { points: 0.09, reason: '利用开局棋子更早凑目标羁绊' } : null;
    case 'items':
      if (hitItems.length) return { points: 0.14, reason: '补目标阵容装备，能和开局装备搭配' };
      if (/装备的(?:弈子|棋子|英雄)|携带[^。；，！\n]{0,8}装备|每有一件装备|重铸|装备拆卸/.test(text)) {
        return { points: 0.14, reason: '利用城邦提供的装备，或调整装备归属' };
      }
      return aug.grantItems?.length ? { points: 0.08, reason: '补充开局装备选择' } : null;
    case 'emblems':
      return hitTraits.some(trait => (aug.grantTraits || []).includes(trait.id)) && /纹章|冠冕/.test(text)
        ? { points: 0.16, reason: '补目标羁绊纹章，提高成型档位的机会' } : null;
    default: return null;
  }
}

export function rankAugments({
  setData, augments = [], ranked = [], selected = new Set(), chosen = new Set(), limit = 6, city, economy,
  itemsData, owned = new Map(), ownedItems = new Set(),
}) {
  const traitIdByName = new Map((setData.traits || []).map((t) => [t.name, t.id]));
  const top = ranked.find((r) => r.viable) || null;
  const comp = top?.comp;
  const selectedIds = selected instanceof Set ? selected : new Set(selected);
  const heldNames = new Set(setData.units.filter(unit => selectedIds.has(unit.id)).map(unit => unit.name));
  const reroll = comp && ((comp.level || 0) <= 7 || setData.units.some(unit =>
    comp.stars?.[unit.id] === 3 && unit.cost <= 3 && comp.units.includes(unit.id)));
  const gear = equipmentContext(comp, itemsData, owned, ownedItems);
  const wantTraits = new Map();
  for (const t of traitBreakdown(setData, selected)) if (t.tier > 0) wantTraits.set(t.id, Math.min(1, 0.45 + t.tier / 12));
  if (comp) for (const id of Object.keys(comp.aimTraits || {})) wantTraits.set(id, 1);

  const missingCore = new Set(top?.detail?.coreMissing || []);

  const scored = [];
  for (const aug of augments) {
    if (chosen.has(aug.id)) continue;
    const ids = new Set([...(aug.traits || []), ...(aug.grantTraits || []), ...(aug.mentionsTraits || []).map((n) => traitIdByName.get(n)).filter(Boolean)]);
    let traitScore = 0;
    const hitTraits = [];
    for (const id of ids) {
      const w = wantTraits.get(id);
      if (!w) continue;
      hitTraits.push({ id, name: (setData.traits || []).find((t) => t.id === id)?.name || id, w });
      traitScore = Math.max(traitScore, w);
    }
    hitTraits.sort((a, b) => b.w - a.w);

    const hitCore = (aug.grantUnits || []).filter((n) => missingCore.has(n));
    const hitAny = (aug.grantUnits || []).length ? [] : (aug.mentionsUnits || []).filter((n) => missingCore.has(n));
    const grants = new Set((aug.grantItems || []).map(value => gear.byName.get(normalizeName(value)) || value));
    const hitItems = [...grants].filter(id => gear.wanted.has(id) && !ownedItems.has(id));
    const gap = gear.gaps.find(row => grants.has(row.missing));
    const heldGrant = (aug.grantUnits || []).find(name => heldNames.has(name));
    const cat = categorize(aug, ids.size);
    const benefits = economyBenefits(aug.desc || '');
    const synergy = citySynergy(aug, city, comp, { hitItems, hitTraits, hitCore, benefits });
    const economic = economyFit(economy, comp, reroll, benefits);
    const inventoryFit = Math.min(0.32, (economic?.points || 0) + (gap ? 0.17 : 0) + (heldGrant ? 0.11 : 0));

    const total = 0.5 * traitScore + 0.3 * Math.min(1, (hitCore.length + hitAny.length) / 2)
      + 0.18 * Math.min(1, hitItems.length) + cat.prior + (synergy?.points || 0) + inventoryFit;
    const score = Math.min(1, total);
    const reasons = [];
    if (synergy) reasons.push(`${city.name} · ${synergy.reason}`);
    if (economic) reasons.push(economic.reason);
    if (heldGrant) reasons.push(`已有 ${heldGrant} · 补牌有助升星`);
    if (gap) reasons.push(`现有散件可搭配 · 补齐${gap.item}`);
    if (hitTraits.length) reasons.push(`贴${hitTraits[0].name}${comp?.aimTraits?.[hitTraits[0].id] ? `(目标 ${comp.aimTraits[hitTraits[0].id]} 人)` : ''}`);
    if (hitCore.length) reasons.push(`给出缺的核心件：${hitCore.join('/')}`);
    else if (hitAny.length) reasons.push(`提到 ${hitAny.join('/')}`);
    if (hitItems.length) reasons.push(`补缺少的成装：${hitItems.map(id => gear.byId.get(id)?.name || id).join('/')}`);
    if (!reasons.length && aug.desc) reasons.push(`${aug.desc.split('\n')[0].slice(0, 30)}${aug.desc.length > 30 ? '…' : ''}`);

    scored.push({ aug, score, total, category: cat.id, reasons });
  }

  return scored
    .sort((a, b) => b.total - a.total || a.aug.name.localeCompare(b.aug.name, 'zh'))
    .slice(0, limit)
    .map(({ total, ...row }) => row);
}
