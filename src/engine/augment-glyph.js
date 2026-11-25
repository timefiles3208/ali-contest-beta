const GRID = 16;
const MAX_DISTANCE = 0.435;
const MIN_MARGIN = 0.055;

export function glyphSignature({ data, width, height }) {
  if (Math.min(width, height) < 14) return null;
  const luminance = new Float32Array(width * height);
  let peak = 0;
  for (let i = 0; i < luminance.length; i++) {
    const j = i * 4;
    const alpha = data[j + 3] / 255;
    const value = (data[j] * 0.28 + data[j + 1] * 0.57 + data[j + 2] * 0.15) * alpha;
    luminance[i] = value;
    peak = Math.max(peak, value);
  }
  if (peak < 90) return null;
  const threshold = Math.max(48, peak * 0.30);
  let left = width, top = height, right = -1, bottom = -1, count = 0, warmth = 0, total = 0;
  for (let i = 0; i < luminance.length; i++) {
    const weight = Math.max(0, (luminance[i] - threshold) / (peak - threshold));
    luminance[i] = weight;
    if (weight < 0.22) continue;
    const x = i % width, y = Math.floor(i / width);
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
    count++;
    warmth += weight * ((data[i * 4] + data[i * 4 + 1]) / 2 - data[i * 4 + 2]);
    total += weight;
  }
  const w = right - left + 1, h = bottom - top + 1;
  if (w < width * 0.28 || h < height * 0.28 || count < w * h * 0.12 || count > w * h * 0.85) return null;
  const at = (x, y) => x >= 0 && x < width && y >= 0 && y < height ? luminance[y * width + x] : 0;
  const pixels = Uint8Array.from({ length: GRID * GRID }, (_, i) => {
    const x = left + (i % GRID + 0.5) * w / GRID - 0.5;
    const y = top + (Math.floor(i / GRID) + 0.5) * h / GRID - 0.5;
    const ix = Math.floor(x), iy = Math.floor(y), dx = x - ix, dy = y - iy;
    const upper = at(ix, iy) * (1 - dx) + at(ix + 1, iy) * dx;
    const lower = at(ix, iy + 1) * (1 - dx) + at(ix + 1, iy + 1) * dx;
    return Math.round(15 * (upper * (1 - dy) + lower * dy));
  });
  return { pixels, color: Math.round(warmth / total), aspect: Math.round(100 * w / h) };
}

export function rankAugmentGlyph(sample, refs) {
  if (!sample) return [];
  const bestById = new Map();
  for (const ref of refs) {
    let difference = 0, union = 0;
    for (let i = 0; i < sample.pixels.length; i++) {
      const a = sample.pixels[i], b = ref.pixels[i];
      difference += Math.abs(a - b);
      union += Math.max(a, b);
    }
    const distance = difference / union + Math.abs(sample.color - ref.color) / 520
      + Math.min(0.2, Math.abs(Math.log(sample.aspect / ref.aspect)) * 0.16);
    bestById.set(ref.id, Math.min(distance, bestById.get(ref.id) ?? Infinity));
  }
  return [...bestById].map(([id, distance]) => ({ id, distance })).sort((a, b) => a.distance - b.distance);
}

export function matchAugmentGlyph(sample, refs) {
  const [best, runnerUp] = rankAugmentGlyph(sample, refs);
  return best && best.distance <= MAX_DISTANCE && (!runnerUp || runnerUp.distance - best.distance >= MIN_MARGIN) ? best.id : null;
}

export function selectedAugmentTiles({ data, width, height }) {
  const ratio = width / height;
  if (width < 640 || ratio < 1.6 || ratio > 2.05) return [];
  const minSide = Math.round(width * 0.014), maxSide = Math.round(width * 0.026);
  const left = Math.floor(width * 0.62), right = Math.floor(width * 0.83);
  const top = Math.floor(height * 0.14), bottom = Math.floor(height * 0.45);
  const nearBlack = (x, y) => {
    const i = (y * width + x) * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    return r >= 16 && r <= 42 && Math.max(r,g,b) - Math.min(r,g,b) <= 7;
  };
  const darkEdge = (x, y, step) => [0, 1, 2, 3].some(offset => nearBlack(x + offset * step, y));
  const tiles = [];
  for (let y = top; y < bottom; y++) {
    let x = left;
    while (x < right) {
      if (!nearBlack(x, y)) { x++; continue; }
      const start = x++;
      while (x < right && (nearBlack(x, y) || nearBlack(x + 1, y) || nearBlack(x + 2, y))) x++;
      const length = x - start;
      if (length < minSide || length > maxSide * 3 || nearBlack(start + 1, y - 2)) continue;
      for (let n = 1; n <= 3; n++) {
        const side = Math.round(length / n);
        if (side < minSide || side > maxSide) continue;
        const edge = (left, step, h) => [0.2, 0.52, 0.78]
          .filter(row => darkEdge(left, y + Math.floor(h * row), step)).length >= 2;
        const marks = [0.2, 0.4, 0.6, 0.8].map(column => start + Math.floor(length * column));
        const heights = [];
        for (let h = Math.round(side * 0.76); h <= Math.round(side * 1.16); h++) {
          if (marks.filter(col => nearBlack(col, y + h - 2)).length < 3) continue;
          if (marks.filter(col => !nearBlack(col, y + h + 1)).length < 3) continue;
          if (edge(start + 1, 1, h) && edge(x - 2, -1, h)) heights.push(h);
        }
        if (!heights.length) continue;
        const h = heights.sort((a, b) => Math.abs(a - side) - Math.abs(b - side))[0];
        if (tiles.some(tile => Math.abs(tile.y - y) < h * 0.5 && tile.x >= start - 3 && tile.x < x + 3)) break;
        for (let i = 0; i < n; i++) {
          tiles.push({ x: start + i * side, y, size: side, ...(side === h ? {} : { height: h }) });
        }
        break;
      }
    }
  }
  return tiles;
}
