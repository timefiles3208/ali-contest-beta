export function modelKey(source, season, unit, version) {
  if (!['dataj', 'datatft'].includes(source) || !Number.isInteger(season) || !unit) return null;
  if (source === 'datatft' && season === 18 && version === '18.7') return `${source}:${season}:${unit}`;
  return version ? `${source}:${season}:${version}:${unit}` : null;
}

let opening;
function openLibrary() {
  return opening ||= new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('当前浏览器无法使用本机模型库。')); return; }
    const request = indexedDB.open('tft-model-library', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('models');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error) => { opening = null; throw error; });
}

async function modelRequest(mode, operation) {
  const db = await openLibrary();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('models', mode);
    const request = operation(tx.objectStore('models'));
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error || new Error('本机模型库操作未完成。'));
    tx.onerror = () => reject(tx.error);
  });
}

export const readModel = (key) => modelRequest('readonly', (store) => store.get(key));
export const saveModel = (key, file) => modelRequest('readwrite', (store) => store.put(file, key));
export const deleteModel = (key) => modelRequest('readwrite', (store) => store.delete(key));

export async function findModel(source, season, unit, version, read = readModel) {
  const key = modelKey(source, season, unit, version);
  if (!key) return null;
  const file = await read(key);
  return file ? { file, source } : null;
}
