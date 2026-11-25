import { formationPlan } from './formation.js';
import { opponentPressure } from './opponent-scout.js?v=formation-plan';
import { openingModelBonus, openingModelFeatures, supportsOpeningModel } from './opening-model.js';
import { recommend } from './recommend.js';
import { rankAugments } from './augments.js?v=recommendation-tools';
import { augmentTier } from '../data/augment-tiers.js';
import { estimateRolldown, validRollBudget } from './rolldown.js';

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

function cityFit(city, comp, itemPoints, unitById, plan) {
  const high = plan.chase.length ? Math.min(1, plan.levelingDemand) : plan.levelingDemand;
  const core = comp.core?.length ? comp.core : comp.units;
  const lowCost = core.filter(id => (unitById.get(id)?.cost ?? 9) <= 3).length / Math.max(core.length, 1);
  switch (city?.effect) {
    case 'level': return high * 5;
    case 'gold': return high * 3;
    case 'rerolls': return plan.chase.length ? 8 : Math.round(lowCost * 4);
    case 'early': return Math.round(lowCost * 4);
    case 'items': return Math.min(8, Math.round(itemPoints / 3));
    case 'emblems': return Math.min(8, Math.max(0, ...Object.values(comp.aimTraits || {})));
    default: return 0;
  }
}

export function rankOpening({ setData, comps, itemsData, selected, level, owned, ownedItems, city, economy, chosenAugments = [], patch, model, opponentBoards = new Map(), rollBudget, unitCopies = new Map(), sourceId = 'datatft' }) {
  const itemById = new Map((itemsData?.items || []).map(row => [row.id, row]));
  const unitById = new Map(setData.units.map(row => [row.id, row]));
  const augmentTraits = new Set(chosenAugments.flatMap(aug => [...(aug.traits || []), ...(aug.grantTraits || [])]));
  const baseline = recommend({ setData, comps, selected, level });
  const hasOpponentEvidence = [...opponentBoards.values()].some(({ routes }) => routes.length);
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
    const chaseHeld = formation.chase.filter(unit => unit.cost <= 3 && selected.has(unit.id));
    const chasePoints = Math.min(6, chaseHeld.length * 3);
    const econ = economy === 'high' && !formation.chase.length ? formation.levelingDemand * 4
      : economy === 'low' && !formation.chase.length ? -formation.levelingDemand * 2 : 0;
    const aug = Math.min(14, Object.keys(comp.aimTraits || {}).filter(id => augmentTraits.has(id)).length * 7);
    const learned = isTrained ? openingModelBonus(openingModelFeatures(comp, selected, gear.points), model.weights) : 0;
    const carry = formation.carries[0];
    let roll = null;
    if (useRolldown && carry) {
      const key = `${carry.id}:${carry.stars}`;
      if (!rollCache.has(key)) {
        const contested = [...opponentBoards.values()].filter(board => board.units?.includes(carry.id)).length;
        const estimate = estimateRolldown(carry, {
          ...rollBudget, contested,
          held: selected.has(carry.id) ? unitCopies.get(carry.id) ?? 1 : 0,
        });
        rollCache.set(key, estimate && { ...estimate, unit: carry });
      }
      roll = rollCache.get(key);
    }
    const rollPoints = roll ? 8 * Math.max(roll.current.probability, roll.upgrade?.probability ?? 0) : 0;
    const viable = Boolean(units || gear.points || city || economy === 'high' || aug || learned || roll);
    const { opponents: opponentCount, discount } = opponentPressure(comp, opponentBoards);
    const fit = units + gear.points + cityPoints + econ + aug + learned + chasePoints + rollPoints - discount;
    const reasons = [
      units && `持有 ${current.length} 名阵容棋子`,
      gear.held.length && `${gear.held.length} 件成装匹配`,
      gear.parts.length && `${gear.parts.length} 种散件可用`,
      cityPoints && `契合${city.name}`,
      econ > 0 && '经济支持搜高费核心',
      econ < 0 && '经济偏紧，较难搜高费核心',
      chasePoints > 0 && `已持有 ${chaseHeld.length} 名低费追星目标`,
      aug && '已选海克斯匹配目标羁绊',
      learned > 0 && '来牌符合已知过渡棋盘',
      opponentCount ? `可能有 ${opponentCount} 家同行，适配扣 ${discount} 分`
        : hasOpponentEvidence && '已分析路线中未发现同行',
    ].filter(Boolean);
    return { ...row, formation, roll, score: Math.max(0, Math.min(100, Math.round(fit))), fit, viable, reasons, gearPoints: gear.points, opponentCount, hasOpponentEvidence };
  });
  return ranked.sort((a, b) => Number(b.viable) - Number(a.viable) || b.fit - a.fit || compareStrength(a, b));
}

export function rankOpeningAugments({ augments, offered, tier, ...context }) {
  const accepted = new Set(offered);
  const eligible = augments.filter(aug => accepted.has(aug.id) && (!tier || augmentTier(aug.id) === tier));
  return rankAugments({ ...context, augments: eligible, limit: 3 });
}
