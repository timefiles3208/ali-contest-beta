import { fillGoldCardSlots } from './augment-icon-ocr.js';
import { entriesForOcr, hasMatchFrame, matchRegionLabel, mergeScreenEvidence, openingNamesInText, screenEvidence } from '../engine/screen-insights.js?v=video-ocr';

const OCR_DIR = new URL('../vendor/ocr/', import.meta.url);
const DESKTOP_STAGE = [0.398, 0.002, 0.420, 0.025];
const DIM_STAGE = [0.398, 0.004, 0.419, 0.025];
const DESKTOP_TRAITS = [0.068, 0.242, 0.137, 0.63];
const COMPACT_TRAITS = [0.095, 0.089, 0.22, 0.51];
const CARD_CENTERS = [0.287, 0.501, 0.715];
const SHOP_LABELS = [0.291, 0.396, 0.501, 0.606, 0.711].map(left => [left, 0.969, left + 0.038, 0.991]);
const MOBILE_SHOP_LABELS = [0.165, 0.327, 0.492, 0.655].map(left => [left, 0.415, left + 0.043, 0.449]);
let worker;
let queue = Promise.resolve();

async function loadWorker() {
  if (!globalThis.Tesseract) {
    const script = document.createElement('script');
    script.src = new URL('tesseract.min.js', OCR_DIR);
    await new Promise((resolve, reject) => {
      script.onload = resolve;
      script.onerror = () => {
        script.remove();
        reject(new Error('识别组件加载失败，请重试。'));
      };
      document.head.append(script);
    });
  }
  const worker = await globalThis.Tesseract.createWorker(['chi_sim', 'eng'], 1, {
    workerPath: new URL('worker.min.js', OCR_DIR).href,
    corePath: OCR_DIR.href,
    langPath: new URL('lang', OCR_DIR).href,
    workerBlobURL: false,
  });
  return worker;
}

function readOcr(canvas, isCurrent, mode = '11', whitelist = '') {
  const job = queue.then(async () => {
    if (!isCurrent()) return null;
    worker ||= loadWorker().catch(error => { worker = null; throw error; });
    const engine = await worker;
    if (!isCurrent()) return null;
    await engine.setParameters({ tessedit_pageseg_mode: mode, tessedit_char_whitelist: whitelist });
    if (!isCurrent()) return null;
    const { data } = await engine.recognize(canvas);
    return data.text;
  });
  queue = job.catch(() => {});
  return job;
}

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

export async function recognizeBoardText(canvas, setData, isCurrent = () => true, { detailed = false, opening, readCards = true } = {}) {
  const text = await readOcr(canvas, isCurrent);
  if (text === null || !isCurrent()) return null;
  const initial = screenEvidence(text, setData);
  const reads = [initial];
  const fullText = [text];
  const landscape = canvas.width >= canvas.height;
  const ratio = canvas.width / canvas.height;
  const desktop = ratio >= 1.65 && ratio <= 1.95;

  if (detailed) {
    // Sparse text finds scattered labels. Block mode also finds short Chinese
    // names in rows that sparse mode can fragment into unrelated glyphs.
    const block = await readOcr(canvas, isCurrent, '6');
    if (block === null || !isCurrent()) return null;
    fullText.push(block);
    reads.push(screenEvidence(block, setData));
  }
  let combined = mergeScreenEvidence(...reads);
  if (desktop && !reads.some(read => read.stage)) {
    for (const threshold of [145, 70, 42]) {
      const area = cropForOcr(canvas, DESKTOP_STAGE, { zoom: 6, threshold });
      const hud = await readOcr(area, isCurrent, '7', '0123456789-');
      if (hud === null || !isCurrent()) return null;
      const stage = screenEvidence(hud, setData).stage;
      if (!stage) continue;
      reads.push({ stage, units: [], traits: [] });
      break;
    }
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
  if (detailed && combined.traits.length === 0) {
    const area = cropForOcr(canvas, [0, 0.09, 0.42, 0.78]);
    const side = await readOcr(area, isCurrent, '6');
    if (side === null || !isCurrent()) return null;
    const { units, traits } = screenEvidence(side, setData);
    reads.push({ stage: null, units, traits });
    combined = mergeScreenEvidence(...reads);
  }
  if (detailed && combined.units.length < 2) {
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
  if (detailed && desktop && stage && stage !== '2-1' &&
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
  evidence.matchFrame = landscape && hasMatchFrame(evidence.stage, fullText.join('\n'));
  if (opening) {
    const entries = entriesForOcr(opening.augments, setData.set);
    evidence.opening = openingNamesInText(fullText.join('\n'), opening.cities, evidence.stage === '2-1' && readCards ? entries : []);
    if (desktop && readCards && evidence.stage === '2-1' && entries.length) {
      const bounds = CARD_CENTERS.map(center => [center - 0.065, 0.485, center + 0.065, 0.516]);
      const passes = [{ zoom: 4, threshold: 130 }, { zoom: 4, threshold: 150 }, { zoom: 4, threshold: 172 }];
      const offeredSlots = await readLabels(canvas, bounds, entries, isCurrent, passes);
      if (offeredSlots === null) return null;
      const slots = setData.set === 18
        ? await fillGoldCardSlots(canvas, CARD_CENTERS, offeredSlots, entries, isCurrent)
        : offeredSlots;
      if (!isCurrent()) return null;
      if (slots.some(Boolean)) evidence.opening.offeredSlots = slots;
    }
  }
  return evidence;
}
