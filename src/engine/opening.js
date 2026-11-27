import { cityFit, formationPlan, formationRow } from './formation.js?v=scout-direction';
import { opponentPressure } from './opponent-scout.js?v=scout-direction';
import { openingModelBonus, openingModelFeatures, supportsOpeningModel } from './opening-model.js';
import { recommend } from './recommend.js';
import { economyBenefits, rankAugments } from './augments.js?v=lineup-augment-guides';
import { augmentTier } from '../data/augment-tiers.js';
import { estimateRolldown, validRollBudget } from './rolldown.js';
import { recommendArtifacts, radiantOptions } from './artifacts.js?v=opponent-equipment';

const TIERS = { 'S+': 7, S: 6, A: 5, B: 4, C: 3, D: 2, E: 1 };

function compareStrength(a, b) {
  const ar = a.comp.rank, br = b.comp.rank;
  return (TIERS[br?.tier] || 0) - (TIERS[ar?.tier] || 0)
    || (br?.top4 ?? 0) - (ar?.top4 ?? 0)
    || (ar?.avg ?? 9) - (br?.avg ?? 9)
    || (b.comp.strength || 0) - (a.comp.strength || 0);
}

function equipmentFit(comp, itemById, owned, ownedItems) {
  const wanted = new Set(Object.values(comp.items || {}).flat());
  const held = [...ownedItems].filter(id => wanted.has(id));
  const components = new Set([...wanted].filter(id => !ownedItems.has(id)).flatMap(id => itemById.get(id)?.from || []));
  const parts = [...owned].filter(([id, count]) => count > 0 && components.has(id)).map(([id]) => id);
  return { held, parts, points: Math.min(36, held.length * 12 + parts.length * 5) };
}

function coreEquipment(formation, itemById, owned, ownedItems, radiant, sourceItems, patch) {
  if (!owned.size && !ownedItems.size) return { carry: false, tank: false };
  const pool = new Map(owned);
  const held = new Set(ownedItems);
  const matchingItem = unit => {
    const artifacts = recommendArtifacts({ ...unit, row: formationRow(unit) }, patch, sourceItems);
    const upgraded = radiant.find(item => unit.items.includes(item.baseId) && (held.has(item.id) || held.has(item.name)));
    if (upgraded) {
      held.delete(upgraded.id);
      held.delete(upgraded.name);
      return true;
    }
    const existing = [...unit.items, ...artifacts.flatMap(item => [item.id, item.name])].find(id => held.has(id));
    if (existing) {
      held.delete(existing);
      return true;
    }
    for (const id of unit.items) {
      const parts = itemById.get(id)?.from;
      if (!parts?.length) continue;
      const recipe = new Map();
      for (const part of parts) recipe.set(part, (recipe.get(part) ?? 0) + 1);
      if ([...recipe].some(([part, amount]) => (pool.get(part) ?? 0) < amount)) continue;
      for (const [part, amount] of recipe) pool.set(part, pool.get(part) - amount);
      return true;
    }
    return false;
  };
  return { carry: formation.carries.some(matchingItem), tank: formation.tanks.some(matchingItem) };
}

export function openingDecision(ranked) {
  const [lead, backup] = ranked.filter(row => row.viable && !row.planning);
  if (!lead) return { status: 'reference', label: '证据不足，以下为备选参考' };
  if (lead.canCommit && (!backup || lead.fit - backup.fit >= 5)) {
    return { status: 'commit', label: '可以定阵', comp: lead.comp };
  }
  return { status: 'lean', label: '建议保留备选', comp: lead.comp };
}

export function rankOpening({ setData, comps, itemsData, selected, level, owned, ownedItems, city, economy, chosenAugments = [], patch, model, opponentBoards = new Map(), rollBudget, unitCopies = new Map(), sourceId = 'datatft', sourceItems }) {
  const itemById = new Map((itemsData?.items || []).map(row => [row.id, row]));
  const unitById = new Map(setData.units.map(row => [row.id, row]));
  const radiant = ownedItems.size ? radiantOptions(patch, itemsData, sourceItems) : [];
  const augmentTraits = new Set(chosenAugments.flatMap(aug => [...(aug.traits || []), ...(aug.grantTraits || [])]));
  const grantedTraits = new Set(chosenAugments.flatMap(aug => aug.grantTraits || []));
  const grantedUnits = new Set(chosenAugments.flatMap(aug => aug.grantUnits || []));
  const benefits = economyBenefits(chosenAugments.map(aug => aug.desc || '').join('\n'));
  const rich = economy === 'high' || (economy !== 'low' && (benefits.grantsXP || benefits.grantsGold));
  const heldCopies = id => selected.has(id) ? unitCopies.get(id) ?? 1 : 0;
  const transition = setData.units.filter(unit => unit.cost <= 3 && selected.has(unit.id));
  const stableOpener = transition.length >= 2 && transition.some(unit => heldCopies(unit.id) >= 3);
  const baseline = recommend({ setData, comps, selected, level });
  const hasOpponentEvidence = [...opponentBoards.values()].some(({ routes, unitCopies }) => routes.length || unitCopies?.size);
  const isTrained = supportsOpeningModel(setData.set, patch, model);
  const useRolldown = sourceId === 'datatft' && setData.set === 18 && patch === '18.7' && validRollBudget(rollBudget);
  const rollCache = new Map();
  const ranked = baseline.map(row => {
    const { comp } = row;
    const current = comp.units.filter(id => selected.has(id));
    const units = Math.min(38, current.length * 5 + row.detail.coreHit.length * 5);
    const gear = equipmentFit(comp, itemById, owned, ownedItems);
    const formation = formationPlan(comp, unitById);
    const cityPoints = cityFit(city, comp, gear.points, unitById, formation);
    const openingReady = coreEquipment(formation, itemById, owned, ownedItems, radiant, sourceItems, patch);
    const gearPoints = gear.points + Number(openingReady.carry) * 3 + Number(openingReady.tank) * 2;
    const chase = formation.chase.filter(unit => unit.cost <= 3);
    const chaseHeld = chase.filter(unit => selected.has(unit.id));
    const chasePoints = Math.min(14, chaseHeld.reduce((sum, unit) => sum + 3 + Math.min(openingReady.carry ? 5 : 2, heldCopies(unit.id) - 1), 0));
    const highCost = formation.levelingDemand > 0 && !chase.length;
    const econ = highCost && rich ? formation.levelingDemand * 4 + (stableOpener ? 4 : 0)
      : highCost && economy === 'low' ? -formation.levelingDemand * 2
        : chase.length && benefits.grantsRolls ? 3 : 0;
    const dedicated = Object.keys(comp.aimTraits || {}).some(id => grantedTraits.has(id))
      || formation.carries.some(unit => grantedUnits.has(unit.id) || grantedUnits.has(unit.name));
    const aug = Math.min(14, Object.keys(comp.aimTraits || {}).filter(id => augmentTraits.has(id)).length * 7)
      + (dedicated ? 5 : 0);
    const learned = isTrained ? openingModelBonus(openingModelFeatures(comp, selected, gear.points), model.weights) : 0;
    const carry = formation.carries[0];
    let roll = null;
    if (useRolldown && carry) {
      const key = `${carry.id}:${carry.stars}`;
      if (!rollCache.has(key)) {
        const contested = [...opponentBoards.values()].reduce((total, board) => total
          + (board.unitCopies?.get(carry.id) ?? Number(board.units?.includes(carry.id) || false)), 0);
        const estimate = estimateRolldown(carry, {
          ...rollBudget, contested,
          held: heldCopies(carry.id),
        });
        rollCache.set(key, estimate && { ...estimate, unit: carry });
      }
      roll = rollCache.get(key);
    }
    const rollPoints = roll ? 8 * Math.max(roll.current.probability, roll.upgrade?.probability ?? 0) : 0;
    const scenario = roll?.upgrade ?? roll?.current;
    const goldAfterLevel = scenario ? rollBudget.gold - scenario.levelGold : null;
    const nearTarget = scenario && carry.rollLevel <= rollBudget.level + 1;
    const funded = nearTarget && (scenario.missing === 0 || goldAfterLevel >= scenario.buyGold + 4);
    const viable = Boolean(units || gearPoints || cityPoints || econ > 0 || aug || learned || rollPoints);
    const { opponents: opponentCount, discount, equippedOpponents, contestedCopies } = opponentPressure(comp, opponentBoards, chase);
    const primaryChase = chase.find(unit => unit.carry) ?? chase[0];
    const enoughCopies = primaryChase && heldCopies(primaryChase.id) >= 3;
    const canCommit = !contestedCopies && !equippedOpponents && discount < 12 && (chase.length
      ? enoughCopies && (openingReady.carry || dedicated)
      : highCost ? stableOpener && rich && openingReady.carry && Boolean(funded)
        : dedicated && openingReady.carry && row.detail.coreHit.length >= 2);
    const budgetPoints = highCost && nearTarget ? funded ? 4 : -6 : 0;
    const fit = units + gearPoints + cityPoints + econ + aug + learned + chasePoints + rollPoints + budgetPoints - discount;
    const reasons = [
      units && `持有 ${current.length} 名阵容棋子`,
      gear.held.length && `${gear.held.length} 件成装匹配`,
      gear.parts.length && `${gear.parts.length} 种散件可用`,
      cityPoints && `契合${city.name}`,
      openingReady.carry && '主 C 装备已持有或可合成',
      openingReady.tank && '主坦装备已持有或可合成',
      highCost && econ > 0 && (stableOpener ? '经济和已升星过渡棋子支持高费方向' : '经济支持考虑高费方向'),
      !highCost && econ > 0 && '已选海克斯提供额外刷新',
      highCost && nearTarget && (funded ? `到 ${scenario.level} 级后约剩 ${goldAfterLevel} 金用于搜牌买牌` : `现有预算到 ${scenario.level} 级后，买牌或刷新金币不足`),
      highCost && econ < 0 && '经济偏紧，较难搜高费核心',
      chasePoints > 0 && `已持有低费追星目标 · ${chaseHeld.map(unit => unit.name + ' ' + heldCopies(unit.id) + ' 张').join('、')}`,
      dedicated ? '已选专属海克斯匹配目标棋子或羁绊' : aug && '已选海克斯匹配目标羁绊',
      learned > 0 && '来牌符合已知过渡棋盘',
      opponentCount ? `可能有 ${opponentCount} 家同行，适配扣 ${discount} 分`
        : hasOpponentEvidence && '已记录的对手中暂无此阵容的同行证据',
      contestedCopies && `已记录对手持有追星目标共 ${contestedCopies} 张`,
      equippedOpponents && `其中 ${equippedOpponents} 家的装备与佩戴棋子契合本阵容`,
    ].filter(Boolean);
    return { ...row, formation, roll, score: Math.max(0, Math.min(100, Math.round(fit))), fit, viable, reasons, gearPoints, openingReady, canCommit, opponentCount, hasOpponentEvidence };
  });
  return ranked.sort((a, b) => Number(b.viable) - Number(a.viable) || b.fit - a.fit || compareStrength(a, b));
}

export function rankOpeningAugments({ augments, offered, tier, ...context }) {
  const accepted = new Set(offered);
  const eligible = augments.filter(aug => accepted.has(aug.id) && (!tier || augmentTier(aug.id) === tier));
  return rankAugments({ ...context, augments: eligible, limit: 3 });
}
