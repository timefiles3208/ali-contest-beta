import { deleteModel, findModel, modelKey, saveModel } from './model-library.js';

const VIEWER_MODULE = '../vendor/model-viewer/model-viewer.min.js';
const MAX_MODEL_BYTES = 25 * 1024 * 1024;
const MAX_REFERENCE_LENGTH = 60_000;
const MODEL_ANGLES = [
  { label: '棋盘斜视', orbit: '35deg 55deg auto' },
  { label: '正面', orbit: '0deg 90deg auto' },
  { label: '右侧', orbit: '90deg 90deg auto' },
  { label: '背面', orbit: '180deg 90deg auto' },
  { label: '左侧', orbit: '-90deg 90deg auto' },
  { label: '俯视', orbit: '0deg 1deg auto' },
];

export async function validateModelFile(file) {
  if (!file || file.size < 20 || file.size > MAX_MODEL_BYTES) throw new Error('请选择不超过 25 MB 的 GLB 模型。');
  const header = new DataView(await file.slice(0, 20).arrayBuffer());
  const jsonLength = header.getUint32(12, true);
  if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 ||
      header.getUint32(8, true) !== file.size || header.getUint32(16, true) !== 0x4e4f534a ||
      !jsonLength || jsonLength > file.size - 20) {
    throw new Error('无法读取模型。请导出为 glTF 2.0 的二进制 GLB 文件。');
  }
  const data = JSON.parse(await file.slice(20, 20 + jsonLength).text());
  const resources = [...(data.buffers || []), ...(data.images || [])];
  if (resources.some((resource) => resource.uri && !resource.uri.startsWith('data:'))) {
    throw new Error('模型引用了外部文件。请重新导出，将纹理和网格嵌入 GLB。');
  }
}

function drawView(ctx, bitmap, x, y, width, height) {
  const scale = Math.min(width / bitmap.width, height / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.drawImage(bitmap, x + (width - w) / 2, y + (height - h) / 2, w, h);
}

async function settleAngle(viewer, orbit) {
  viewer.cameraOrbit = orbit;
  await viewer.updateComplete;
  viewer.jumpCameraToGoal();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

async function captureReference(viewer, angles, isCurrent) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!angles.length) {
    const bitmap = await createImageBitmap(await viewer.toBlob({ mimeType: 'image/png' }));
    try {
      const scale = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      ctx.fillStyle = '#141b24';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drawView(ctx, bitmap, 0, 0, canvas.width, canvas.height);
    } finally {
      bitmap.close();
    }
    return encodeReference(canvas);
  }

  const size = 192;
  canvas.width = 3 * size;
  canvas.height = 2 * size;
  const { theta, phi, radius } = viewer.getCameraOrbit();
  const originalOrbit = `${theta}rad ${phi}rad ${radius}m`;
  viewer.removeAttribute('camera-controls');
  try {
    for (const [index, { label, orbit }] of angles.entries()) {
      if (!isCurrent()) return null;
      await settleAngle(viewer, orbit);
      if (!isCurrent()) return null;
      const bitmap = await createImageBitmap(await viewer.toBlob({ mimeType: 'image/png' }));
      try {
        const x = index % 3 * size;
        const y = Math.floor(index / 3) * size;
        ctx.fillStyle = index % 2 ? '#18212d' : '#141b24';
        ctx.fillRect(x, y, size, size);
        drawView(ctx, bitmap, x + 4, y + 20, size - 8, size - 24);
        ctx.fillStyle = '#f1f5f9';
        ctx.font = '14px sans-serif';
        ctx.fillText(label, x + 8, y + 16);
      } finally {
        bitmap.close();
      }
    }
    return encodeReference(canvas);
  } finally {
    if (viewer.isConnected) {
      viewer.setAttribute('camera-controls', '');
      await settleAngle(viewer, originalOrbit);
    }
  }
}

function encodeReference(canvas) {
  for (const quality of [0.82, 0.68, 0.52, 0.36]) {
    const data = canvas.toDataURL('image/jpeg', quality).split(',')[1];
    if (data && data.length <= MAX_REFERENCE_LENGTH) return data;
  }
  throw new Error('模型参考图过大，请改用当前角度生成。');
}

export function bindModelReference({ file, unit, display, angle, use, useAll, clear, status, preview, game, save, load, remove }) {
  let viewer, url, reference, module, revision = 0;
  let scope, currentFile, storedModel, assignedKey, modelSource;
  const setStatus = (message) => { status.textContent = message; };
  const unitId = () => unit.selectedOptions[0]?.dataset.unitId;
  const currentKey = () => modelKey(scope?.source, scope?.season, unitId());
  const hasOwnModel = () => !!storedModel && storedModel.source === scope?.source;
  const usesFallback = () => modelSource === 'datatft' && scope?.source === 'dataj';
  function refreshButtons() {
    save.disabled = !currentKey() || !currentFile || !viewer?.loaded || usesFallback();
    save.textContent = hasOwnModel() ? '替换本机模型' : '保存到本机';
    load.textContent = storedModel && !hasOwnModel() ? '载入云顶参考' : '载入本机模型';
    load.disabled = !storedModel;
    remove.disabled = !hasOwnModel();
  }
  async function refreshLibrary() {
    const key = currentKey();
    const activeScope = scope;
    storedModel = null;
    refreshButtons();
    if (!key) return;
    try {
      const saved = await findModel(activeScope.source, activeScope.season, unitId());
      if (scope === activeScope && key === currentKey()) {
        storedModel = saved || null;
        refreshButtons();
      }
    } catch {
      if (scope === activeScope && key === currentKey()) setStatus('无法读取本机模型库，仍可直接导入 GLB。');
    }
  }
  const setControls = (disabled) => { angle.disabled = use.disabled = useAll.disabled = disabled; };
  const removeReference = () => {
    reference = null;
    preview.replaceChildren();
    preview.hidden = true;
  };
  angle.replaceChildren(new Option('自由视角', ''), ...MODEL_ANGLES.map(({ label, orbit }) => new Option(label, orbit)));
  const reset = () => {
    revision++;
    removeReference();
    viewer?.remove();
    viewer = null;
    currentFile = null;
    assignedKey = null;
    modelSource = null;
    if (url) URL.revokeObjectURL(url);
    url = null;
    setControls(true);
    angle.value = '';
    clear.disabled = true;
    display.hidden = true;
    refreshButtons();
  };

  async function showModel(selected, source = scope?.source) {
    reset();
    const current = revision;
    assignedKey = currentKey();
    modelSource = source;
    clear.disabled = false;
    setStatus('正在读取模型…');
    try {
      await validateModelFile(selected);
      module ||= import(VIEWER_MODULE).catch((error) => { module = null; throw error; });
      await module;
      if (current !== revision) return;
      viewer = document.createElement('model-viewer');
      viewer.setAttribute('camera-controls', '');
      viewer.setAttribute('loading', 'eager');
      viewer.setAttribute('alt', '棋子 3D 模型预览');
      viewer.addEventListener('camera-change', (event) => {
        if (event.detail.source === 'user-interaction') angle.value = '';
      });
      viewer.addEventListener('load', () => {
        if (current !== revision) return;
        currentFile = selected;
        setControls(false);
        refreshButtons();
        setStatus(usesFallback() ? '已载入云顶模型参考，可旋转查看并生成参考图。' : '可拖动旋转模型，选择棋子后生成参考图。');
      }, { once: true });
      viewer.addEventListener('error', () => {
        if (current !== revision) return;
        reset();
        setStatus('模型未能渲染，请检查 GLB 文件或浏览器的 WebGL 支持。');
      }, { once: true });
      url = URL.createObjectURL(selected);
      viewer.src = url;
      display.hidden = false;
      display.append(viewer);
    } catch (error) {
      if (current !== revision) return;
      reset();
      setStatus(error.message || '无法加载模型，请换一个 GLB 文件。');
    }
  }
  file.onchange = () => {
    const selected = file.files?.[0];
    file.value = '';
    if (selected) void showModel(selected);
  };
  angle.onchange = () => {
    if (viewer?.loaded && angle.value) viewer.cameraOrbit = angle.value;
  };
  unit.onchange = () => {
    if (assignedKey && assignedKey !== currentKey()) {
      reset();
      setStatus('已切换棋子，请导入或载入对应模型。');
    } else {
      removeReference();
      if (viewer?.loaded) setStatus('已选择棋子，可以生成参考图或保存到本机。');
    }
    void refreshLibrary();
  };
  save.onclick = async () => {
    const key = currentKey();
    const activeScope = scope;
    if (!key || !currentFile || usesFallback()) return;
    const activeFile = currentFile;
    try {
      await saveModel(key, activeFile);
      if (scope !== activeScope || key !== currentKey()) return;
      if (activeFile === currentFile) assignedKey = key;
      await refreshLibrary();
      if (scope === activeScope && key === currentKey() && storedModel) setStatus('已保存到本机。选择这名棋子即可重新载入。');
    } catch {
      if (scope === activeScope && key === currentKey()) setStatus('本机保存失败，请检查浏览器的存储空间。');
    }
  };
  load.onclick = () => {
    if (storedModel) void showModel(storedModel.file, storedModel.source);
  };
  remove.onclick = async () => {
    const key = currentKey();
    const activeScope = scope;
    if (!key || !hasOwnModel()) return;
    try {
      await deleteModel(key);
      if (scope !== activeScope || key !== currentKey()) return;
      await refreshLibrary();
      if (scope === activeScope && key === currentKey() && !hasOwnModel()) setStatus('已从本机模型库移除。');
    } catch {
      if (scope === activeScope && key === currentKey()) setStatus('未能移除本机模型，请重试。');
    }
  };
  async function generate(angles) {
    const name = unit.selectedOptions[0]?.value;
    if (!viewer?.loaded || !name) { setStatus('请先选择这个模型对应的棋子。'); return; }
    const current = revision;
    removeReference();
    setControls(true);
    setStatus(angles.length ? '正在渲染六个视角…' : '正在生成当前视角…');
    try {
      const data = await captureReference(viewer, angles, () => current === revision && name === unit.value);
      if (!data || current !== revision || name !== unit.value) return;
      reference = { name, data, game: modelSource };
      const image = new Image();
      image.alt = angles.length ? `${name}的六视角参考图` : `${name}的模型参考图`;
      image.src = `data:image/jpeg;base64,${data}`;
      preview.replaceChildren(image);
      preview.hidden = false;
      const viewpoint = angles.length ? '六视角' : '单视角';
      setStatus(`当前参考：${name}（${usesFallback() ? '云顶模型，' : ''}${viewpoint}）。开始识别时会同时发送这张参考图。`);
    } catch (error) {
      if (current === revision) setStatus(error.message || '模型参考图生成失败，请重试。');
    } finally {
      if (current === revision) setControls(false);
    }
  }
  use.onclick = () => generate([]);
  useAll.onclick = () => generate(MODEL_ANGLES);
  clear.onclick = () => { reset(); setStatus('已移除模型和识别参考。'); };
  return {
    get: () => reference,
    setScope(source, season, label) {
      scope = { source, season };
      storedModel = null;
      file.disabled = unit.disabled = !season;
      unit.value = '';
      reset();
      game.textContent = season ? `${label} · S${season}` : label;
      setStatus('');
    },
  };
}
