import { entriesForOcr, hasMatchFrame, openingNamesInText, screenEvidence } from '../engine/screen-insights.js?v=video-ocr';

const SDK = 'https://cdn.jsdelivr.net/npm/@paddleocr/paddleocr-js@0.4.2/+esm';
const TIMEOUT_MS = 35_000;
const SLOT_CENTERS = [0.287, 0.501, 0.715];
let model;
let active;

function loadModel() {
  model ??= import(SDK).then(({ PaddleOCR }) => PaddleOCR.create({
    lang: 'ch',
    ocrVersion: 'PP-OCRv5',
    ortOptions: { backend: 'wasm', numThreads: 1 },
  })).catch(error => {
    model = undefined;
    throw error;
  });
  return model;
}

export async function readNeuralText(canvas) {
  if (active) return null;
  const job = loadModel().then(async ocr => {
    const [result] = await ocr.predict(canvas, { textRecScoreThresh: 0.65, textDetLimitSideLen: 1280 });
    return result?.items ?? [];
  }).catch(() => null).finally(() => { active = undefined; });
  active = job;
  let timeout;
  try {
    return await Promise.race([job, new Promise(resolve => { timeout = setTimeout(() => resolve(null), TIMEOUT_MS); })]);
  } finally {
    clearTimeout(timeout);
  }
}

function textLines(items, { width, height }) {
  return items.flatMap(({ text, score, poly }) => {
    if (!text?.trim() || !Number.isFinite(score) || score < 0.7 || !poly?.length) return [];
    return [{
      text,
      x: poly.reduce((sum, point) => sum + point[0], 0) / poly.length / width,
      y: poly.reduce((sum, point) => sum + point[1], 0) / poly.length / height,
    }];
  }).filter(line => Number.isFinite(line.x) && Number.isFinite(line.y));
}

export function mergeNeuralEvidence(base, items, size, setData, opening) {
  const lines = textLines(items, size);
  const names = rows => entriesForOcr(rows, setData.set);
  const join = rows => rows.map(row => row.text).join('\n');
  const labels = join(lines.filter(line => line.y > 0.12 && line.x < 0.88));
  const units = openingNamesInText(labels, [], names(setData.units)).offered;
  const traits = screenEvidence(labels, { set: setData.set, units: [], traits: setData.traits }).traits;
  const hud = lines.filter(line => line.y <= 0.12 && line.x >= 0.28 && line.x <= 0.65);
  const stage = base.stage || screenEvidence(join(hud), { units: [] }, { hud: true }).stage;
  const output = {
    ...base, stage,
    units: [...new Set([...base.units, ...units])],
    traits: [...new Set([...base.traits, ...traits])],
  };
  if (opening && stage === '2-1') {
    const entries = names(opening.augments);
    const known = base.opening?.offeredSlots || [null, null, null];
    const added = SLOT_CENTERS.map(center => {
      const texts = join(lines.filter(line => Math.abs(line.x - center) <= 0.08 && line.y >= 0.47 && line.y <= 0.55));
      const ids = openingNamesInText(texts, [], entries).offered;
      return ids.length === 1 ? ids[0] : null;
    });
    const slots = known.map((id, i) => id || added[i]);
    if (slots.some(Boolean) && new Set(slots.filter(Boolean)).size === slots.filter(Boolean).length) {
      output.opening = { cities: [], offered: [], ...base.opening, offeredSlots: slots };
    }
  }
  const confirmsCards = (output.opening?.offeredSlots?.filter(Boolean).length ?? 0) >= 2;
  const confirmsShop = hasMatchFrame(null, join(lines));
  output.matchFrame = base.matchFrame || Boolean(size.width >= size.height && stage && (confirmsCards || confirmsShop));
  return output;
}
