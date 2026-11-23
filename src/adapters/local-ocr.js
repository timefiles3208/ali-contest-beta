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

export function readOcr(canvas, isCurrent = () => true) {
  const job = queue.then(async () => {
    if (!isCurrent()) return null;
    worker ||= loadWorker().catch(error => { worker = null; throw error; });
    const engine = await worker;
    if (!isCurrent()) return null;
    const { data } = await engine.recognize(canvas);
    return data.text;
  });
  queue = job.catch(() => {});
  return job;
}
