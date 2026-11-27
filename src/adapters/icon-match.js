import { catalogIcon } from '../ui/helpers.js?v=game-release-scope';

const ATLAS = 'https://ddragon.leagueoflegends.com/cdn';
const SAMPLE_SIZE = 12;
const MAX_DISTANCE = 0.105;
const MIN_MARGIN = 0.014;
const sheets = new Map();
const templates = new Map();
const catalogTemplates = new Map();
let alignmentOffsets;

export function matchIconSignature(sample, candidates) {
  const scored = candidates.map(candidate => {
    let sum = 0;
    for (let i = 0; i < sample.length; i++) sum += Math.abs(sample[i] - candidate.signature[i]);
    return { id: candidate.id, distance: sum / (sample.length * 255) };
  }).sort((a, b) => a.distance - b.distance);
  const [best, runnerUp] = scored;
  return best && best.distance <= MAX_DISTANCE &&
    (!runnerUp || runnerUp.distance - best.distance >= MIN_MARGIN) ? [best] : [];
}

function buildAlignmentOffsets() {
  const shifts = Math.floor(SAMPLE_SIZE / 4);
  const offsets = [];
  for (let dy = -shifts; dy <= shifts; dy += 0.5) {
    for (let dx = -shifts; dx <= shifts; dx += 0.5) {
      if ((SAMPLE_SIZE - Math.abs(dx)) * (SAMPLE_SIZE - Math.abs(dy)) < SAMPLE_SIZE ** 2 * 0.65) continue;
      const pairs = [];
      for (let y = Math.max(0, Math.ceil(-dy)); y <= Math.min(SAMPLE_SIZE - 1, Math.floor(SAMPLE_SIZE - 1 - dy)); y++) {
        for (let x = Math.max(0, Math.ceil(-dx)); x <= Math.min(SAMPLE_SIZE - 1, Math.floor(SAMPLE_SIZE - 1 - dx)); x++) {
          const left = Math.floor(x + dx);
          const top = Math.floor(y + dy);
          const right = Math.min(left + 1, SAMPLE_SIZE - 1);
          const bottom = Math.min(top + 1, SAMPLE_SIZE - 1);
          pairs.push([3 * (y * SAMPLE_SIZE + x), 3 * (top * SAMPLE_SIZE + left),
            3 * (top * SAMPLE_SIZE + right), 3 * (bottom * SAMPLE_SIZE + left), 3 * (bottom * SAMPLE_SIZE + right)]);
        }
      }
      const fx = dx - Math.floor(dx);
      const fy = dy - Math.floor(dy);
      offsets.push({ pairs, fx, fy, penalty: 0.002 * (Math.abs(dx) + Math.abs(dy)) });
    }
  }
  return offsets;
}

export function matchAlignedIconSignature(sample, candidates) {
  alignmentOffsets ??= buildAlignmentOffsets();
  const scored = candidates.map(candidate => {
    let distance = Infinity;
    const data = candidate.signature;
    for (const { pairs, fx, fy, penalty } of alignmentOffsets) {
      let sum = 0;
      for (const [a, tl, tr, bl, br] of pairs) {
        for (let c = 0; c < 3; c++) {
          const top = data[tl + c] * (1 - fx) + data[tr + c] * fx;
          const bottom = data[bl + c] * (1 - fx) + data[br + c] * fx;
          sum += Math.abs(sample[a + c] - (top * (1 - fy) + bottom * fy));
        }
      }
      distance = Math.min(distance, sum / (pairs.length * 3 * 255) + penalty);
    }
    return { id: candidate.id, distance };
  }).sort((a, b) => a.distance - b.distance);
  const [best, runnerUp] = scored;
  return best && best.distance <= MAX_DISTANCE &&
    (!runnerUp || runnerUp.distance - best.distance >= MIN_MARGIN) ? best : null;
}

function signature(image, sx, sy, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SAMPLE_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#181c23';
  ctx.fillRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  ctx.drawImage(image, sx, sy, width, height, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  return data.filter((_, i) => i % 4 !== 3);
}

function atlas(version, file) {
  const url = `${ATLAS}/${version}/img/sprite/${file}`;
  if (!sheets.has(url)) {
    const load = fetch(url, { signal: AbortSignal.timeout(9000) }).then(async response => {
      if (!response.ok) throw new Error('图标模板未能加载。');
      return createImageBitmap(await response.blob());
    }).catch(error => {
      sheets.delete(url);
      throw error;
    });
    sheets.set(url, load);
  }
  return sheets.get(url);
}

export async function recognizeCroppedIcon(file, entries, version) {
  const image = await createImageBitmap(file);
  try {
    const ratio = image.width / image.height;
    if (Math.min(image.width, image.height) < 16 || ratio < 0.75 || ratio > 1.33) {
      throw new Error('请裁出一枚近似正方形的完整图标（至少 16×16 像素）。');
    }
    const catalog = entries.filter(entry => entry.sprite?.file);
    if (!version || !catalog.length) throw new Error('当前赛季没有可用的图标模板。');
    const refs = await Promise.all(catalog.map(async ({ id, sprite }) => {
      const key = `${version}/${sprite.file}/${sprite.x}/${sprite.y}`;
      if (!templates.has(key)) {
        const sheet = await atlas(version, sprite.file);
        if (!templates.has(key)) {
          templates.set(key, signature(sheet, sprite.x, sprite.y, sprite.w || 48, sprite.h || 48));
        }
      }
      return { id, signature: templates.get(key) };
    }));
    const sample = signature(image, 0, 0, image.width, image.height);
    const result = matchIconSignature(sample, refs)[0] || matchAlignedIconSignature(sample, refs);
    return catalog.find(entry => entry.id === result?.id) || null;
  } finally {
    image.close();
  }
}

function goldSpatulaTemplate(url) {
  if (!catalogTemplates.has(url)) {
    const request = fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(5_000) }).then(async response => {
      if (!response.ok) throw new Error('图标模板暂不可用。');
      const bitmap = await createImageBitmap(await response.blob());
      try { return signature(bitmap, 0, 0, bitmap.width, bitmap.height); }
      finally { bitmap.close(); }
    }).catch(error => {
      catalogTemplates.delete(url);
      throw error;
    });
    catalogTemplates.set(url, request);
  }
  return catalogTemplates.get(url);
}

export async function recognizePostgameIcon(file, entries, isCurrent) {
  const image = await createImageBitmap(file);
  let sample;
  try {
    const ratio = image.width / image.height;
    if (Math.min(image.width, image.height) < 16 || ratio < 0.75 || ratio > 1.33) {
      throw new Error('请裁出一枚近似正方形的图标（至少 16×16 像素）。');
    }
    sample = signature(image, 0, 0, image.width, image.height);
  } finally { image.close(); }
  const valid = entries.flatMap(entry => {
    const url = catalogIcon(entry.icon);
    return url ? [{ entry, url }] : [];
  });
  const refs = [];
  for (let start = 0; start < valid.length && isCurrent(); start += 12) {
    const group = await Promise.allSettled(valid.slice(start, start + 12).map(async ({ entry, url }) => ({
      id: entry.id, signature: await goldSpatulaTemplate(url),
    })));
    refs.push(...group.flatMap(result => result.status === 'fulfilled' ? [result.value] : []));
  }
  if (!isCurrent()) return null;
  if (!refs.length || refs.length < valid.length * 0.9) throw new Error('本版本图标模板暂不可用，请稍后重试。');
  const result = matchIconSignature(sample, refs)[0];
  return entries.find(entry => entry.id === result?.id) || null;
}
