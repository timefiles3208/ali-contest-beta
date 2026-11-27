import { withinRecognitionBudget } from '../engine/recognition-budget.js';
import { mergeNeuralEvidence, readNeuralText } from './paddle-ocr.js?v=share-ocr';
import { readOwnShopHud, recognizeBoardText } from './local-ocr.js?v=game-release-scope';

export class SnapshotError extends Error {
  constructor(code, message, { status = 0, loginUrl = '' } = {}) {
    super(message);
    this.name = 'SnapshotError';
    this.code = code;
    this.status = status;
    this.loginUrl = loginUrl;
  }
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new SnapshotError('file_unreadable', '这张图读不出来，请换一张截图。'));
    fr.readAsDataURL(file);
  });
}

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new SnapshotError('file_unreadable', '浏览器无法解码这张图片。'));
    img.src = src;
  });

export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const SNIFF_BYTES = 32;
const EXT_KIND = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', avif: 'image/avif' };
const imageTypes = new Set(Object.values(EXT_KIND));
const mimeKind = (file) => {
  const type = String(file?.type || '').toLowerCase();
  if (type === 'image/jpg' || type === 'image/pjpeg') return 'image/jpeg';
  return imageTypes.has(type) ? type : null;
};

// 剪贴板/拖拽进来的文件经常没有 MIME（.jfif、微信转存、部分系统），只看 file.type 会把 JPG 挡在门外。
export const looksLikeImage = (file) =>
  !!file && Boolean(mimeKind(file) || extKind(file));

function sniffMagic(head) {
  const b = new Uint8Array(head);
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  const header = new TextDecoder().decode(b);
  if (/^GIF8[79]a/.test(header)) return 'image/gif';
  if (b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp';
  if (header.slice(4, 8) === 'ftyp' && /avif|avis/.test(header.slice(8))) return 'image/avif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

const extKind = (file) => {
  const ext = String(file?.name || '').toLowerCase().match(/\.([a-z]+)$/)?.[1];
  return Object.hasOwn(EXT_KIND, ext) ? EXT_KIND[ext] : null;
};

export async function imageKind(file) {
  if (!file) return null;
  if (typeof file.slice === 'function' && typeof file.arrayBuffer === 'function') {
    try {
      const magic = sniffMagic(await file.slice(0, SNIFF_BYTES).arrayBuffer());
      if (magic) return magic;
    } catch {
      /* 读不到头几字节就退回扩展名/MIME */
    }
  }
  return mimeKind(file) || extKind(file);
}

export async function importImageUrl(value) {
  let url;
  try { url = new URL(value.trim()); } catch { /* invalid address */ }
  if (url?.protocol !== 'https:' || url.username || url.password) {
    throw new SnapshotError('invalid_url', '请输入以 https:// 开头的图片直链。');
  }
  let reader;
  try {
    const response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', signal: AbortSignal.timeout(12000) });
    if (!response.ok || !response.body) throw new Error('unavailable');
    reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      bytes += chunk.byteLength;
      if (bytes > MAX_SOURCE_BYTES) {
        void reader.cancel().catch(() => {});
        throw new SnapshotError('source_too_large', '请选择不超过 20 MB 的图片。');
      }
      chunks.push(chunk);
    }
    return new Blob(chunks, { type: response.headers.get('content-type')?.split(';')[0] || '' });
  } catch (error) {
    if (error instanceof SnapshotError) throw error;
    throw new SnapshotError('image_url_unavailable', '无法读取该直链。请使用允许跨站访问的图片链接，或下载图片后导入。');
  } finally {
    reader?.releaseLock();
  }
}

export function snapshotFromEvidence(evidence, setData, opening) {
  const allowedIds = (rows, ids) => {
    if (!Array.isArray(ids)) return [];
    const catalog = new Set(rows.map(row => row.id));
    return [...new Set(ids.filter(id => catalog.has(id)))];
  };
  const names = (rows, ids) => {
    const allowed = new Set(allowedIds(rows, ids));
    return rows.filter(row => allowed.has(row.id)).map(({ name }) => ({ name }));
  };
  const stage = typeof evidence.stage === 'string' && /^[1-9]-[1-7]$/.test(evidence.stage) ? evidence.stage : null;
  const result = {
    stage,
    matchFrame: evidence.matchFrame === true,
    candidates: names(setData.units, evidence.units),
    traits: names(setData.traits || [], evidence.traits),
  };
  if (result.matchFrame && evidence.shop) Object.assign(result, evidence.shop);
  if (!result.matchFrame || stage !== '2-1' || !evidence.opening || !opening) return result;

  const { cities, offered, offeredSlots } = evidence.opening;
  result.opening = {
    cities: allowedIds(opening.cities || [], cities),
    offered: allowedIds(opening.augments || [], offered),
  };
  if (Array.isArray(offeredSlots)) {
    const allowed = new Set(allowedIds(opening.augments || [], offeredSlots));
    const slots = [0, 1, 2].map(index => allowed.delete(offeredSlots[index]) ? offeredSlots[index] : null);
    if (slots.some(Boolean)) result.opening.offeredSlots = slots;
  }
  return result;
}

export async function recognizeSnapshot(file, rotation, setData, isCurrent, opening, enhanced = false, onEnhanced) {
  let base, items, size, shop, neural, neuralSettled = false;
  const result = (ai, timedOut) => {
    if (base?.scopeMismatch) return { scopeMismatch: base.scopeMismatch };
    const empty = { stage: null, matchFrame: false, units: [], traits: [] };
    const evidence = items && (!setData.scope || base) ? mergeNeuralEvidence(base || empty, items, size, setData, opening) : { ...(base || empty) };
    if (evidence.stage && evidence.stage !== '2-1' && shop) evidence.shop = shop;
    return { ...snapshotFromEvidence(evidence, setData, opening), ai, timedOut };
  };
  const timed = await withinRecognitionBudget(async (current) => {
    const active = () => isCurrent() && current();
    const canvas = await snapshotCanvas(file, rotation);
    if (!active()) return;
    size = canvas;
    let settleEnhanced, shopReady = false;
    const enhancedReady = new Promise(resolve => { settleEnhanced = resolve; });
    const completeEnhanced = () => {
      if (!enhanced || !active() || !shopReady || !items?.length || !base?.matchFrame) return;
      if (base.stage === '2-1' && opening) {
        const cards = mergeNeuralEvidence(base, items, size, setData, opening).opening?.offeredSlots;
        if (cards?.filter(Boolean).length !== 3) return;
      }
      settleEnhanced();
    };
    const shopRead = setData.scope?.sourceId === 'dataj' ? Promise.resolve(null) : readOwnShopHud(canvas, active);
    const readShop = shopRead.then(profile => {
      if (active()) shop = profile;
    }).catch(() => {}).finally(() => {
      shopReady = true;
      completeEnhanced();
    });
    const publish = evidence => {
      if (!active() || !evidence) return;
      base = evidence;
      completeEnhanced();
    };
    const standard = recognizeBoardText(canvas, setData, active, {
      detailed: true, opening,
      onProgress: publish,
    }).then(publish);
    if (!enhanced) {
      await Promise.all([standard, readShop]);
      return;
    }
    neural = readNeuralText(canvas, isCurrent).then(rows => {
      neuralSettled = true;
      if (isCurrent() && rows?.length) items = rows;
      completeEnhanced();
    });
    await Promise.race([
      Promise.allSettled([standard, neural, readShop]).then(([regular]) => {
        if (regular.status === 'rejected' && !items) throw regular.reason;
      }),
      enhancedReady,
    ]);
  }, enhanced ? 18_000 : undefined);
  if (!isCurrent() || (!timed.timedOut && base === null)) return null;
  if (neural && !neuralSettled && onEnhanced) {
    void neural.then(() => {
      if (isCurrent()) onEnhanced(result(items ? 'used' : 'fallback', false));
    }).catch(() => {});
    return result('pending', false);
  }
  return result(enhanced ? (items ? 'used' : 'fallback') : null, timed.timedOut && !items);
}

async function snapshotCanvas(file, rotation) {
  const img = await loadImage(await readAsDataUrl(file));
  const scale = Math.min(1, 2160 / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const sideways = rotation % 180 !== 0;
  const canvas = document.createElement('canvas');
  canvas.width = sideways ? height : width;
  canvas.height = sideways ? width : height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(rotation * Math.PI / 180);
  ctx.drawImage(img, -width / 2, -height / 2, width, height);
  return canvas;
}

const norm = (s) => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
const stripVariant = (s) => String(s ?? '').replace(/\s*[(（][^)）]*[)）]/g, '');

function indexByName(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = norm(stripVariant(row.name));
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function lookup(map, name) {
  const key = norm(stripVariant(name));
  if (!key) return null;
  const rows = map.get(key) || [];
  const exact = rows.filter((row) => norm(row.name) === norm(name));
  return norm(name) !== key && exact.length ? exact : rows;
}

function mapUnits(rows, unitMap) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const name = String(typeof row === 'string' ? row : row?.name ?? '').trim().slice(0, 24);
    const meta = typeof row === 'object' && row ? row : {};
    const appearance = typeof meta.appearance === 'string' ? meta.appearance : '';
    if (!name && !appearance) return null;
    const found = name ? lookup(unitMap, name) : null;
    return {
      name,
      star: Number(meta.star) || null,
      cost: Number(meta.cost) || null,
      items: Array.isArray(meta.items) ? meta.items.filter((item) => typeof item === 'string') : [],
      appearance,
      row: meta.row,
      col: meta.col,
      id: found && found.length === 1 ? found[0].id : null,
      variants: found && found.length > 1 ? found.map((u) => ({ id: u.id, label: String(u.name).replace(/^[^(]*\(/, '').replace(/\)$/, '') || u.id, cost: u.cost })) : null,
    };
  }).filter(Boolean);
}

function mapInventory(rows, index) {
  return (Array.isArray(rows) ? rows : [])
      .map((row) => {
        const name = String(typeof row === 'string' ? row : row?.name ?? '').trim().slice(0, 24);
        if (!name) return null;
        const found = lookup(index, name);
        return { name, count: Math.min(9, Math.max(1, Number(row?.count) || 1)), id: found?.length === 1 ? found[0].id : null };
      })
      .filter(Boolean);
}

export function matchSnapshot(snapshot, { setData, itemsData }) {
  const unitMap = indexByName(setData?.units || []);
  const traitMap = indexByName(setData?.traits || []);
  const mapped = {
    candidates: mapUnits(snapshot?.candidates, unitMap).map(unit => ({ ...unit, excluded: true })),
    board: mapUnits(snapshot?.board, unitMap),
    bench: mapUnits(snapshot?.bench, unitMap),
    shop: mapUnits(snapshot?.shop, unitMap),
    components: mapInventory(snapshot?.components, indexByName(itemsData?.components || [])),
    items: mapInventory(snapshot?.items, indexByName(itemsData?.items || [])),
    traits: (Array.isArray(snapshot?.traits) ? snapshot.traits : []).flatMap((row) => {
      if (typeof row?.name !== 'string' || !row.name.trim()) return [];
      const found = lookup(traitMap, row.name);
      return [{ name: found?.length === 1 ? found[0].name : row.name, id: found?.length === 1 ? found[0].id : null, count: row.count ?? null, tier: row.tier ?? null }];
    }),
    level: Number.isInteger(snapshot?.level) ? snapshot.level : null,
    gold: Number.isInteger(snapshot?.gold) ? snapshot.gold : null,
    xp: Number.isInteger(snapshot?.xp) ? snapshot.xp : null,
    hp: Number.isInteger(snapshot?.hp) ? snapshot.hp : null,
    stage: snapshot?.stage || null,
    matchFrame: snapshot?.matchFrame !== false,
    notes: snapshot?.notes || null,
  };
  const all = [...mapped.candidates, ...mapped.board, ...mapped.bench, ...mapped.shop];
  mapped.missing = all.filter((u) => u.name && !u.id && !u.variants).map((u) => u.name);
  mapped.ambiguous = all.filter((u) => u.variants);
  mapped.componentMissing = mapped.components.filter((c) => !c.id).map((c) => c.name);
  return mapped;
}

// 应用已核对的棋子。OCR 候选默认需要主动勾选。
export function autoSelect(mapped) {
  const selected = [...mapped.board, ...mapped.bench, ...(mapped.candidates || [])].filter((u) => u.id && !u.excluded);
  const ids = [...new Set(selected.map((u) => u.id))];
  const stars = new Map();
  for (const u of selected) if (u.star) stars.set(u.id, Math.max(stars.get(u.id) || 0, u.star));
  return { ids, stars };
}
