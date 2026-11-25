import { glyphSignature, matchAugmentGlyph, selectedAugmentTiles } from '../engine/augment-glyph.js';

const REFERENCES = new URL('../data/s18.18.7.selected-augment-icons.json', import.meta.url);
const SPRITES = new URL('../data/s18.18.7.selected-augment-icons.webp', import.meta.url);
const DISPLAY_SIZE = 24;
let loading, atlas;

export function warmOpponentAugmentIcons() {
  loading ??= fetch(REFERENCES).then(async response => {
    if (!response.ok) throw Error('Augment icon catalog unavailable');
    const data = await response.json();
    atlas = {
      columns: data.atlas.columns, rows: Math.ceil(data.atlas.ids.length / data.atlas.columns),
      positions: new Map(data.atlas.ids.map((id, index) => [id, index])),
    };
    return data.icons.map(([id, color, aspect, hex]) => ({
      id, color, aspect, pixels: Uint8Array.from(hex, c => Number.parseInt(c, 16)),
    }));
  }).catch(() => { loading = undefined; return []; });
  return loading;
}

export function augmentIconElement(id) {
  const index = atlas?.positions.get(id);
  if (index == null) return null;
  const icon = document.createElement('span');
  icon.className = 'scout-augment-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.style.backgroundImage = `url("${SPRITES}")`;
  icon.style.backgroundSize = `${atlas.columns * DISPLAY_SIZE}px ${atlas.rows * DISPLAY_SIZE}px`;
  icon.style.backgroundPosition = `-${(index % atlas.columns) * DISPLAY_SIZE}px -${Math.floor(index / atlas.columns) * DISPLAY_SIZE}px`;
  return icon;
}

async function currentTemplates(augments) {
  const allowed = new Set(augments.map(row => row.id));
  return (await warmOpponentAugmentIcons()).filter(ref => allowed.has(ref.id));
}

export async function readSelectedAugmentIcons(canvas, augments, isCurrent) {
  const { width, height } = canvas;
  if (width / height < 1.6 || width / height > 2.05 || width < 640) return [];
  const ctx = canvas.getContext('2d');
  const regions = selectedAugmentTiles(ctx.getImageData(0, 0, width, height));
  if (!regions.length || !isCurrent()) return [];
  const refs = await currentTemplates(augments);
  if (!isCurrent() || !refs.length) return [];
  const matches = regions
    .map(({ x, y, size, height = size }) => {
      const full = matchAugmentGlyph(glyphSignature(ctx.getImageData(x, y, size, height)), refs);
      const inset = matchAugmentGlyph(glyphSignature(ctx.getImageData(x + 1, y, size - 2, height - 2)), refs);
      return full && inset && full !== inset ? null : full || inset;
    })
    .filter(Boolean);
  return matches.length <= 3 ? [...new Set(matches)] : [];
}

export async function readCroppedAugmentIcon(file, augments) {
  const image = await createImageBitmap(file);
  try {
    if (Math.min(image.width, image.height) < 16 ||
        image.width / image.height < 0.8 || image.width / image.height > 1.25) return null;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = Math.min(64, image.width, image.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return matchAugmentGlyph(glyphSignature(ctx.getImageData(0, 0, canvas.width, canvas.height)), await currentTemplates(augments));
  } finally {
    image.close();
  }
}
