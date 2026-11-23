import { mergeScreenEvidence, openingNamesInText, screenEvidence } from '../engine/screen-insights.js?v=opening-advice';

const OCR_DIR = new URL('../vendor/ocr/', import.meta.url);
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
  await worker.setParameters({ tessedit_pageseg_mode: '11' });
  return worker;
}

function readOcr(canvas, isCurrent, parameters) {
  const job = queue.then(async () => {
    if (!isCurrent()) return null;
    worker ||= loadWorker().catch(error => { worker = null; throw error; });
    const engine = await worker;
    if (!isCurrent()) return null;
    const { data } = await engine.recognize(canvas, parameters);
    return data.text;
  });
  queue = job.catch(() => {});
  return job;
}

function cropForOcr(image, [left, top, right, bottom]) {
  const w = Math.max(1, Math.round(image.width * (right - left)));
  const h = Math.max(1, Math.round(image.height * (bottom - top)));
  const scale = Math.min(3, 1800 / Math.max(w, h));
  const crop = document.createElement('canvas');
  const border = 12;
  crop.width = Math.round(w * scale) + border * 2;
  crop.height = Math.round(h * scale) + border * 2;
  const ctx = crop.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, crop.width, crop.height);
  ctx.filter = 'grayscale(1) contrast(1.35)';
  ctx.drawImage(image, Math.round(image.width * left), Math.round(image.height * top), w, h,
    border, border, crop.width - border * 2, crop.height - border * 2);
  return crop;
}

export async function recognizeBoardText(canvas, setData, isCurrent = () => true, { detailed = false, opening } = {}) {
  const text = await readOcr(canvas, isCurrent);
  if (text === null || !isCurrent()) return null;
  const initial = screenEvidence(text, setData);
  const reads = [initial];
  const landscape = canvas.width >= canvas.height;

  if (!initial.stage) {
    const area = cropForOcr(canvas, landscape ? [0.10, 0, 0.92, 0.20] : [0, 0, 1, 0.24]);
    const hud = await readOcr(area, isCurrent, { tessedit_pageseg_mode: '7' });
    if (hud === null || !isCurrent()) return null;
    reads.push({ stage: screenEvidence(hud, setData, { hud: true }).stage, units: [], traits: [] });
  }
  if (detailed && initial.traits.length === 0) {
    const area = cropForOcr(canvas, [0, 0.09, 0.42, 0.78]);
    const side = await readOcr(area, isCurrent, { tessedit_pageseg_mode: '6' });
    if (side === null || !isCurrent()) return null;
    reads.push({ stage: null, units: [], traits: screenEvidence(side, setData).traits });
  }
  if (detailed && initial.units.length < 2) {
    const area = cropForOcr(canvas, [0, 0.66, 1, 1]);
    const shop = await readOcr(area, isCurrent);
    if (shop === null || !isCurrent()) return null;
    reads.push({ stage: null, units: screenEvidence(shop, setData).units, traits: [] });
  }
  const evidence = mergeScreenEvidence(...reads);
  if (opening) evidence.opening = openingNamesInText(text, opening);
  return evidence;
}
