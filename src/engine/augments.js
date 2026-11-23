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

export function rankAugments({ setData, augments = [], ranked = [], selected, chosen = new Set(), limit = 6 }) {
  const traitIdByName = new Map((setData.traits || []).map((t) => [t.name, t.id]));
  const top = ranked.find((r) => r.viable) || null;
  const comp = top?.comp;
  const wantTraits = new Map();
  for (const t of traitBreakdown(setData, selected)) if (t.tier > 0) wantTraits.set(t.id, Math.min(1, 0.45 + t.tier / 12));
  if (comp) for (const id of Object.keys(comp.aimTraits || {})) wantTraits.set(id, 1);

  const missingCore = new Set(top?.detail.coreMissing || []);
  const wantItems = new Set(comp && comp.items ? Object.values(comp.items).flat() : []);

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
    const hitItems = (aug.grantItems || []).filter((n) => wantItems.has(n));
    const cat = categorize(aug, ids.size);

    const score = Math.max(0, Math.min(1, 0.5 * traitScore + 0.3 * Math.min(1, (hitCore.length + hitAny.length) / 2) + 0.18 * Math.min(1, hitItems.length) + cat.prior));
    const reasons = [];
    if (hitTraits.length) reasons.push(`贴${hitTraits[0].name}${comp?.aimTraits?.[hitTraits[0].id] ? `(目标 ${comp.aimTraits[hitTraits[0].id]} 人)` : ''}`);
    if (hitCore.length) reasons.push(`给出缺的核心件：${hitCore.join('/')}`);
    else if (hitAny.length) reasons.push(`提到 ${hitAny.join('/')}`);
    if (hitItems.length) reasons.push(`给出成装：${hitItems.join('/')}`);
    if (!reasons.length) reasons.push(`${aug.desc.split('\n')[0].slice(0, 30)}${aug.desc.length > 30 ? '…' : ''}`);

    scored.push({ aug, score, category: cat.id, reasons });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.aug.name.localeCompare(b.aug.name, 'zh'))
    .slice(0, limit);
}
