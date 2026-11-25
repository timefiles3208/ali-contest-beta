import { transitionGuides } from '../data/s18.18.7.transitions.js';

export const MAX_LEARNED_BONUS = 10;
export const OPENING_FEATURE_COUNT = 6;
export const supportsOpeningModel = (season, patch, model) =>
  Boolean(model) && model.season === season && model.patch === patch && model.source === 'datatft.com'
  && Array.isArray(model.weights) && model.weights.length === OPENING_FEATURE_COUNT
  && model.weights.every(Number.isFinite);

export function openingModelFeatures(comp, selected, gearPoints) {
  const guide = transitionGuides[comp.id];
  if (comp.rank?.source !== 'datatft.com' || !guide || !guide.anchors.every(id => comp.units.includes(id))) return null;
  const units = guide.stages[4];
  if (!units) return null;
  const hits = units.filter(id => selected.has(id)).length;
  if (hits < 2) return null;
  const substitutes = units.filter(id => selected.has(id) && !comp.units.includes(id)).length;
  const coreHits = (comp.core || []).filter(id => selected.has(id)).length;
  return [1, hits / units.length, substitutes / units.length, Math.min(1, coreHits / 4),
    Math.min(1, gearPoints / 36), Math.min(1, units.length / selected.size)];
}

export function openingModelBonus(features, weights) {
  if (!features) return 0;
  return Math.min(MAX_LEARNED_BONUS, Math.max(0, features.reduce((sum, value, i) => sum + value * weights[i], 0)));
}
