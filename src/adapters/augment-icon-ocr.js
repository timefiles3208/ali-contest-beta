import { augmentTier } from '../data/augment-tiers.js';

const SIDE = 24;
const MAX_DISTANCE = 0.33;
const MIN_MARGIN = 0.12;
const REFERENCE = new URL('../data/s18.18.7.gold-augment-icons.json', import.meta.url);
let templates;

function loadTemplates() {
  templates ??= fetch(REFERENCE).then(async response => {
    if (!response.ok) throw new Error('Icon reference unavailable');
    const data = await response.json();
    return data.icons.map(([id, hex]) => ({
      id, signature: Uint8Array.from(hex, digit => Number.parseInt(digit, 16)),
    }));
  }).catch(() => {
    templates = undefined;
    return [];
  });
  return templates;
}

function goldShape({ data, width, height }) {
  const weights = new Float32Array(width * height);
  let left = width, right = -1, top = height, bottom = -1, count = 0;
  for (let i = 0; i < weights.length; i++) {
    const j = i * 4;
    const r = data[j], g = data[j + 1], b = data[j + 2];
    if (r < 125 || r - b < 48 || g - b < 28 || g > r * 0.98) continue;
    const weight = Math.min(1, (r - 85) / 135);
    weights[i] = weight;
    if (weight <= 0.62) continue;
    const x = i % width, y = Math.floor(i / width);
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
    count++;
  }
  if (count < 12 || right - left < width * 0.18 || bottom - top < height * 0.18) return null;

  const at = (x, y) => x >= 0 && x < width && y >= 0 && y < height ? weights[y * width + x] : 0;
  return Uint8Array.from({ length: SIDE * SIDE }, (_, i) => {
    const x = left + (i % SIDE + 0.5) * (right - left + 1) / SIDE - 0.5;
    const y = top + (Math.floor(i / SIDE) + 0.5) * (bottom - top + 1) / SIDE - 0.5;
    const ix = Math.floor(x), iy = Math.floor(y), dx = x - ix, dy = y - iy;
    const upper = at(ix, iy) * (1 - dx) + at(ix + 1, iy) * dx;
    const lower = at(ix, iy + 1) * (1 - dx) + at(ix + 1, iy + 1) * dx;
    return Math.round(15 * (upper * (1 - dy) + lower * dy));
  });
}

function closest(shape, refs) {
  if (!shape) return null;
  const ranked = refs.map(({ id, signature }) => {
    let difference = 0, union = 0;
    for (let i = 0; i < shape.length; i++) {
      difference += Math.abs(shape[i] - signature[i]);
      union += Math.max(shape[i], signature[i]);
    }
    return { id, distance: difference / union };
  }).sort((a, b) => a.distance - b.distance);
  const [best, next] = ranked;
  return best && best.distance <= MAX_DISTANCE && (!next || next.distance - best.distance >= MIN_MARGIN)
    ? best.id : null;
}

export async function fillGoldCardSlots(canvas, centers, slots, entries, isCurrent) {
  if (slots.every(Boolean) || slots.some(id => id && augmentTier(id) !== 'gold')) return slots;
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  const shapes = centers.map((center, i) => slots[i] ? null : goldShape(ctx.getImageData(
    Math.round(width * (center - 0.05)), Math.round(height * 0.312),
    Math.round(width * 0.1), Math.round(height * 0.145),
  )));
  if (shapes.filter(Boolean).length + slots.filter(Boolean).length < 2) return slots;

  const allowed = new Set(entries.map(entry => entry.id));
  const refs = (await loadTemplates()).filter(row => allowed.has(row.id));
  if (!isCurrent()) return slots;
  const resolved = slots.map((id, i) => id || closest(shapes[i], refs));
  const unique = new Set(resolved.filter(Boolean));
  // A single glyph could also be from unrelated game UI. Require two distinct cards.
  return unique.size >= 2 && unique.size === resolved.filter(Boolean).length ? resolved : slots;
}
