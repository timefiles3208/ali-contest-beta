const ATLAS = 'https://ddragon.leagueoflegends.com/cdn';
const SAMPLE_SIZE = 12;
const MAX_DISTANCE = 0.105;
const MIN_MARGIN = 0.014;
const sheets = new Map();
const templates = new Map();

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
    const [result] = matchIconSignature(signature(image, 0, 0, image.width, image.height), refs);
    return catalog.find(entry => entry.id === result?.id) || null;
  } finally {
    image.close();
  }
}
