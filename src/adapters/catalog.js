import { loadJson } from '../ui/helpers.js';

const API = 'https://dubfaazkkthmwwtkplwm.supabase.co/rest/v1/tft_catalog';
const PUBLISHABLE_KEY = 'sb_publishable_AfgS6UsN9aDur-TYvK9d-w_M3UaILkp';
const datasets = new Map([
  ['./src/data/set18.json', ['units-traits', 'riot', '16.23.1', ['units', 'traits']]],
  ['./src/data/set18.items.json', ['items', 'riot', '16.23.1', ['items', 'components']]],
  ['./src/data/set18.augments.json', ['augments', 'riot', '16.23.1', ['augments']]],
  ['./src/data/datatft/s18.18.7.comps.json', ['compositions', 'datatft', '18.7', ['comps']]],
  ['./src/data/datatft/s18.18.7.ratings.json', ['ratings', 'datatft', '18.7', ['ratings']]],
  ['./src/data/dataj/s18.18.7.json', ['rankings', 'dataj', '18.7', ['comps', 'items', 'augments']]],
]);

export async function loadCatalog(path) {
  const entry = datasets.get(path);
  if (entry) {
    const [dataset, source, version, fields] = entry;
    const url = new URL(API);
    url.search = new URLSearchParams({
      dataset: `eq.${dataset}`, source: `eq.${source}`, season: 'eq.18',
      version: `eq.${version}`, select: 'payload', limit: '1',
    }).toString();
    try {
      const response = await fetch(url, {
        headers: { apikey: PUBLISHABLE_KEY },
        signal: AbortSignal.timeout(3500),
      });
      if (response.ok) {
        const [record] = await response.json();
        const payload = record?.payload;
        if ((payload?.set ?? payload?.season) === 18 && fields.every(field =>
          field === 'ratings' ? payload[field] && typeof payload[field] === 'object' : Array.isArray(payload[field]))) {
          return payload;
        }
      }
    } catch {
      // The bundled release remains usable during a network or database outage.
    }
  }
  return loadJson(path);
}
