import { contentFrame } from './game-frame.js';
import { createOcrLane } from './ocr-lane.js';
import { fillGoldCardSlots } from './augment-icon-ocr.js?v=layout';
import { entriesForOcr, hasMatchFrame, matchRegionLabel, mergeScreenEvidence, openingNamesInText, opponentTraitLabels, parseShopHud, readOpponentProfile, screenEvidence, stageAfterOpening } from '../engine/screen-insights.js?v=recommendation-tools';

const OCR_DIR = new URL('../vendor/ocr/', import.meta.url);
const DESKTOP_STAGE = [0.398, 0.002, 0.420, 0.025];
const EARLY_STAGE = [0.426, 0.002, 0.449, 0.027];
const DIM_STAGE = [0.398, 0.004, 0.419, 0.025];
const DESKTOP_TRAITS = [0.068, 0.242, 0.137, 0.63];
const COMPACT_TRAITS = [0.095, 0.089, 0.22, 0.51];
const CARD_CENTERS = [0.287, 0.501, 0.715];
const SHOP_LABELS = [0.291, 0.396, 0.501, 0.606, 0.711].map(left => [left, 0.969, left + 0.038, 0.991]);
const MOBILE_SHOP_LABELS = [0.165, 0.327, 0.492, 0.655].map(left => [left, 0.415, left + 0.043, 0.449]);
let runtime;

function loadRuntime() {
  if (globalThis.Tesseract) return Promise.resolve(globalThis.Tesseract);
  runtime ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('tesseract.min.js', OCR_DIR);
    const failed = () => {
      script.remove();
      reject(new Error('识别组件加载失败，请重试。'));
    };
    script.onload = () => globalThis.Tesseract ? resolve(globalThis.Tesseract) : failed();
    script.onerror = failed;
    document.head.append(script);
  }).catch(error => {
    runtime = undefined;
    throw error;
  });
  return runtime;
}

async function loadWorker() {
  const tesseract = await loadRuntime();
  return tesseract.createWorker(['chi_sim', 'eng'], 1, {
    workerPath: new URL('worker.min.js', OCR_DIR).href,
    corePath: OCR_DIR.href,
    langPath: new URL('lang', OCR_DIR).href,
    workerBlobURL: false,
  });
}

const opening = createOcrLane(loadWorker);
const scout = createOcrLane(loadWorker);
const readOcr = opening.read;
export const warmOpeningOcr = opening.warm;
export const warmScoutOcr = scout.warm;

function cropForOcr(image, [left, top, right, bottom], { zoom = 3, threshold = 0, contrast = true, fixed = false } = {}) {
  const pixel = fixed ? v => v : Math.round;
  const w = Math.max(1, pixel(image.width * (right - left)));
  const h = Math.max(1, pixel(image.height * (bottom - top)));
  const scale = Math.min(zoom, 1800 / Math.max(w, h));
  const crop = document.createElement('canvas');
  const border = fixed ? 16 : 12;
  crop.width = (fixed ? 260 : Math.round(w * scale)) + border * 2;
  crop.height = (fixed ? Math.max(70, Math.round(260 * h / w)) : Math.round(h * scale)) + border * 2;
  const ctx = crop.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, crop.width, crop.height);
  if (contrast && !threshold) ctx.filter = 'grayscale(1) contrast(1.35)';
  ctx.drawImage(image, pixel(image.width * left), pixel(image.height * top), w, h,
    border, border, crop.width - border * 2, crop.height - border * 2);
  if (threshold) {
    const pixels = ctx.getImageData(border, border, crop.width - border * 2, crop.height - border * 2);
    const { data } = pixels;
    for (let i = 0; i < data.length; i += 4) {
      const light = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      data[i] = data[i + 1] = data[i + 2] = light >= threshold ? 0 : 255;
    }
    ctx.putImageData(pixels, border, border);
  }
  return crop;
}

async function readLabels(canvas, regions, entries, isCurrent, passes) {
  const ids = [];
  for (const bounds of regions) {
    let id = null;
    for (const pass of passes) {
      const area = cropForOcr(canvas, bounds, { zoom: 5, ...pass });
      const text = await readOcr(area, isCurrent, '7');
      if (text === null || !isCurrent()) return null;
      id = matchRegionLabel(text, entries);
      if (id) break;
    }
    ids.push(id);
  }
  return ids;
}

async function readDimStage(canvas, setData, isCurrent) {
  for (const threshold of [0, 45]) {
    const area = cropForOcr(canvas, DIM_STAGE, { fixed: true, contrast: false, threshold });
    const text = await readOcr(area, isCurrent, '13', '0123456789-');
    if (text === null || !isCurrent()) return null;
    const stage = screenEvidence(text, setData).stage;
    if (stage) return stage;
  }
  return null;
}

async function readHudStage(canvas, setData, isCurrent) {
  for (const [bounds, threshold] of [[DESKTOP_STAGE, 70], [EARLY_STAGE, 100], [DESKTOP_STAGE, 42], [DESKTOP_STAGE, 145]]) {
    const area = cropForOcr(canvas, bounds, { zoom: 6, threshold });
    const text = await readOcr(area, isCurrent, '7', '0123456789-');
    if (text === null || !isCurrent()) return null;
    const stage = screenEvidence(text, setData).stage;
    if (stage) return stage;
  }
  return null;
}

function scaledForText(canvas, maxWidth = 1440) {
  if (canvas.width <= maxWidth) return canvas;
  const scaled = document.createElement('canvas');
  scaled.width = maxWidth;
  scaled.height = Math.max(1, Math.round(canvas.height * maxWidth / canvas.width));
  scaled.getContext('2d').drawImage(canvas, 0, 0, scaled.width, scaled.height);
  return scaled;
}
async function openingSlots(canvas, setData, entries, isCurrent, onSlots) {
  // A shared viewer may clip a 16:9 surface or letterbox it into a taller window.
  const scale = (canvas.width * 9 / 16) / canvas.height;
  const layouts = [1, scale, 0.94, 1.06]
    .filter((value, i, all) => value >= 0.88 && value <= 1.13 && all.findIndex(other => Math.abs(other - value) < 0.02) === i);
  let best = [];
  for (const heightScale of layouts) {
    const bounds = CARD_CENTERS.map(center => [center - 0.065, 0.485 * heightScale, center + 0.065, 0.516 * heightScale]);
    const passes = heightScale === 1 ? [130, 150, 172] : [130, 150];
    let slots = await readLabels(canvas, bounds, entries, isCurrent, passes.map(threshold => ({ zoom: 4, threshold })));
    if (!slots) return null;
    if (setData.set === 18) slots = await fillGoldCardSlots(canvas, CARD_CENTERS, slots, entries, isCurrent, heightScale);
    if (!isCurrent()) return null;
    const matches = slots.filter(Boolean);
    if (new Set(matches).size !== matches.length) continue;
    if (matches.length > best.filter(Boolean).length) {
      best = slots;
      onSlots?.(best);
    }
    if (matches.length === 3) break;
  }
  return best;
}

export async function readOwnShopHud(canvas, isCurrent) {
  if (canvas.width / canvas.height < 1.65 || canvas.width / canvas.height > 1.95) return null;
  const read = (bounds, characters, threshold = 145, mode = '7') =>
    readOcr(cropForOcr(canvas, bounds, { zoom: 6, threshold }), isCurrent, mode, characters);
  const level = await read([0.126, 0.815, 0.153, 0.841], '0123456789');
  if (!level || !isCurrent()) return null;
  const gold = await read([0.475, 0.817, 0.502, 0.842], '0123456789');
  const xp = await read([0.195, 0.819, 0.214, 0.837], '0123456789/', 115, '13');
  const profile = parseShopHud(gold || '', level, xp || '');
  return isCurrent() && profile.level != null && profile.gold != null ? profile : null;
}

export async function recognizeBoardText(canvas, setData, isCurrent = () => true, {
  detailed = false, opening, readCards = true, fastOpening = false, stageOnly = false, readShop = false, onStage, onProgress,
} = {}) {
  if (fastOpening) canvas = contentFrame(canvas);
  const landscape = canvas.width >= canvas.height;
  const ratio = canvas.width / canvas.height;
  const desktop = ratio >= 1.65 && ratio <= 1.95;
  const canReadCards = ratio >= 1.52 && ratio <= 2.12;
  const hint = (fastOpening || detailed) && canReadCards ? await readHudStage(canvas, setData, isCurrent) : null;
  if (!isCurrent()) return null;
  let slots;
  if (hint && fastOpening) {
    onStage?.(hint);
    const evidence = { stage: hint, units: [], traits: [], matchFrame: true };
    if (stageOnly || stageAfterOpening(hint) || (hint === '2-1' && !readCards)) return evidence;
    if (hint.startsWith('1-') && readShop) {
      return { ...evidence, shop: await readOwnShopHud(canvas, isCurrent) };
    }
    if (hint === '2-1' && opening && readCards) {
      const withSlots = offeredSlots => ({ ...evidence, opening: { cities: [], offered: [], offeredSlots } });
      slots = await openingSlots(canvas, setData, entriesForOcr(opening.augments, setData.set), isCurrent,
        found => onProgress?.(withSlots(found)));
      if (!slots || !isCurrent()) return null;
      if (slots.every(Boolean) && slots.length === 3) {
        return withSlots(slots);
      }
    }
  }
  if (stageOnly && fastOpening) {
    const hud = cropForOcr(canvas, [0.28, 0, 0.68, 0.082], { zoom: 1.8 });
    const text = await readOcr(hud, isCurrent);
    return text && isCurrent() ? { stage: screenEvidence(text, setData).stage } : null;
  }
  let earlyShop;
  if (detailed && desktop && hint && hint !== '2-1') {
    onProgress?.({ stage: hint, matchFrame: true, units: [], traits: [] });
    earlyShop = await readLabels(canvas, SHOP_LABELS, entriesForOcr(setData.units, setData.set), isCurrent, [{ threshold: 200 }]);
    if (!earlyShop || !isCurrent()) return null;
    earlyShop = earlyShop.filter(Boolean);
    onProgress?.({ stage: hint, matchFrame: true, units: earlyShop, traits: [] });
  }
  const textCanvas = detailed ? scaledForText(canvas) : canvas;
  const text = await readOcr(textCanvas, isCurrent);
  if (text === null || !isCurrent()) return null;
  const initial = screenEvidence(text, setData);
  if (stageOnly) return { stage: initial.stage };
  const reads = [initial];
  const fullText = [text];
  if (hint) reads.push({ stage: hint, units: earlyShop || [], traits: [] });

  if (detailed && (!earlyShop || earlyShop.length < 2)) {
    // Sparse text finds scattered labels. Block mode also finds short Chinese
    // names in rows that sparse mode can fragment into unrelated glyphs.
    const block = await readOcr(textCanvas, isCurrent, '6');
    if (block === null || !isCurrent()) return null;
    fullText.push(block);
    reads.push(screenEvidence(block, setData));
  }
  let combined = mergeScreenEvidence(...reads);
  if (desktop && !reads.some(read => read.stage)) {
    const stage = await readHudStage(canvas, setData, isCurrent);
    if (!isCurrent()) return null;
    if (stage) reads.push({ stage, units: [], traits: [] });
  }
  if (desktop && !reads.some(read => read.stage)) {
    const stage = await readDimStage(canvas, setData, isCurrent);
    if (!isCurrent()) return null;
    reads.push({ stage, units: [], traits: [] });
  }
  if (!reads.some(read => read.stage)) {
    const area = cropForOcr(canvas, landscape ? [0.10, 0, 0.92, 0.20] : [0, 0, 1, 0.24]);
    const hud = await readOcr(area, isCurrent, '7');
    if (hud === null || !isCurrent()) return null;
    reads.push({ stage: screenEvidence(hud, setData, { hud: true }).stage, units: [], traits: [] });
  }
  if (onProgress) {
    const evidence = mergeScreenEvidence(...reads);
    onProgress({ ...evidence, matchFrame: landscape && hasMatchFrame(evidence.stage, text) });
  }
  if (detailed && combined.traits.length === 0) {
    const area = cropForOcr(canvas, [0, 0.09, 0.42, 0.78]);
    const side = await readOcr(area, isCurrent, '6');
    if (side === null || !isCurrent()) return null;
    const { units, traits } = screenEvidence(side, setData);
    reads.push({ stage: null, units, traits });
    combined = mergeScreenEvidence(...reads);
  }
  if (detailed && (combined.units.length < 2 || (earlyShop && earlyShop.length < 4))) {
    const area = cropForOcr(canvas, [0, 0.66, 1, 1]);
    const shop = await readOcr(area, isCurrent);
    if (shop === null || !isCurrent()) return null;
    reads.push({ stage: null, units: screenEvidence(shop, setData).units, traits: [] });
  }
  if (detailed && landscape) {
    const area = cropForOcr(canvas, desktop ? DESKTOP_TRAITS : COMPACT_TRAITS, { contrast: false });
    const side = await readOcr(area, isCurrent, '6');
    if (side === null || !isCurrent()) return null;
    reads.push({ stage: null, units: [], traits: screenEvidence(side, setData).traits });
  }
  const stage = mergeScreenEvidence(...reads).stage;
  if (detailed && !earlyShop && desktop && stage && stage !== '2-1' &&
    (combined.units.length > 0 || /刷新|购买经验值/.test(fullText.join('')))) {
    const shop = await readLabels(canvas, SHOP_LABELS, entriesForOcr(setData.units, setData.set), isCurrent, [{ threshold: 200 }]);
    if (shop === null) return null;
    reads.push({ stage: null, units: shop.filter(Boolean), traits: [] });
  }
  if (detailed && ratio >= 2 && ratio <= 2.35 && stage && stage !== '2-1') {
    const regions = entriesForOcr(setData.units, setData.set);
    const shop = await readLabels(canvas, MOBILE_SHOP_LABELS, regions, isCurrent,
      [{ threshold: 125 }, { threshold: 195 }]);
    if (shop === null) return null;
    reads.push({ stage: null, units: shop.filter(Boolean), traits: [] });
  }
  const evidence = mergeScreenEvidence(...reads);
  if ((!hint || !fastOpening) && evidence.stage) onStage?.(evidence.stage);
  evidence.matchFrame = landscape && hasMatchFrame(evidence.stage, fullText.join('\n'));
  if (opening) {
    const entries = entriesForOcr(opening.augments, setData.set);
    evidence.opening = openingNamesInText(fullText.join('\n'), opening.cities, evidence.stage === '2-1' && readCards ? entries : []);
    if (canReadCards && readCards && evidence.stage === '2-1' && entries.length) {
      slots ??= await openingSlots(canvas, setData, entries, isCurrent);
      if (!slots || !isCurrent()) return null;
      if (slots.some(Boolean)) evidence.opening.offeredSlots = slots;
    }
  }
  return evidence;
}

export async function recognizeOpponentLabels(canvas, setData, isCurrent, augments = [], onPartial) {
  const board = contentFrame(canvas);
  const bounds = [0.03, 0.12, 0.87, 0.82];
  const labels = cropForOcr(board, bounds, { zoom: 1, contrast: false });
  const text = await scout.read(labels, isCurrent);
  if (text === null || !isCurrent()) return null;
  const profile = readOpponentProfile(text, augments);
  const evidence = {
    units: openingNamesInText(text, [], entriesForOcr(setData.units, setData.set)).offered,
    traits: screenEvidence(text, setData).traits,
    ...profile,
  };
  onPartial?.(evidence);

  const titleFragments = text.split('\n').map(line => line.split(/[:：]/).at(-1)).join('\n');
  const possibleTitle = openingNamesInText(titleFragments, [], augments).offered.length;
  if (profile.augmentIds.length || (profile.gold == null && !possibleTitle)) return evidence;

  // A second segmentation can recover the full label from a tooltip that sparse OCR split.
  const focused = await scout.read(cropForOcr(board, bounds, { zoom: 1.2 }), isCurrent, '6');
  if (!focused || !isCurrent()) return evidence;
  const second = readOpponentProfile(focused, augments);
  return { ...evidence, gold: profile.gold ?? second.gold, augmentIds: second.augmentIds };
}

export async function recognizeOpponentTraitStrip(canvas, setData, isCurrent, known = [], unitCount = 0, fastOnly = false) {
  const board = contentFrame(canvas);
  const strip = cropForOcr(board, [0.065, 0.235, 0.147, 0.638], { zoom: 4 });
  const text = await scout.read(strip, isCurrent, '6');
  if (!isCurrent()) return [];
  const traits = [...new Set([...opponentTraitLabels(text || '', setData), ...screenEvidence(text || '', setData).traits])];
  if (fastOnly || new Set([...known, ...traits]).size + unitCount >= 2) return traits;
  const wider = cropForOcr(board, [0.035, 0.22, 0.17, 0.64], { zoom: 2.5 });
  const extra = await scout.read(wider, isCurrent, '6');
  return isCurrent() ? [...new Set([...traits, ...screenEvidence(extra || '', setData).traits,
    ...opponentTraitLabels(extra || '', setData)])] : traits;
}
