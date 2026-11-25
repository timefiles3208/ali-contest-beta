import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCatalogBundle } from '../src/adapters/catalog.js';

const units = './src/data/set18.json';
const items = './src/data/set18.items.json';
const corePaths = [units, items];
const source = { ddragonVersion: '16.23.1' };
const unitPayload = { set: 18, source, units: [{ id: 'a', name: '棋子', cost: 1 }], traits: [{ id: 't', name: '羁绊' }] };
const itemsPayload = { set: 18, source, items: [{ id: 'i', name: '装备' }], components: [{ id: 'p', name: '散件' }] };
const row = (dataset, payload) => ({ dataset, source: 'riot', season: 18, version: '16.23.1', payload });

test('loads a complete remote bundle from one anonymous request', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.match(String(url), /supabase\.co/);
    assert.equal(typeof options.headers.apikey, 'string');
    assert.equal(options.credentials, 'omit');
    return Response.json([row('items', itemsPayload), row('units-traits', unitPayload)]);
  });
  assert.deepEqual(await loadCatalogBundle(corePaths), { values: [unitPayload, itemsPayload], location: 'database' });
  assert.equal(fetch.mock.callCount(), 1);
});

test('uses all local files when one remote payload is absent, malformed or stamped with another version', async t => {
  for (const remote of [
    [row('units-traits', unitPayload)],
    [row('units-traits', { ...unitPayload, units: [] }), row('items', itemsPayload)],
    [row('units-traits', unitPayload), row('items', { ...itemsPayload, source: { ddragonVersion: '16.22.1' } })],
  ]) {
    const fetch = t.mock.method(globalThis, 'fetch', async url => {
      if (String(url).startsWith('https://')) return Response.json(remote);
      return Response.json(url === units ? unitPayload : itemsPayload);
    });
    assert.deepEqual(await loadCatalogBundle(corePaths), { values: [unitPayload, itemsPayload], location: 'bundled' });
    assert.equal(fetch.mock.callCount(), 3);
    fetch.mock.restore();
  }
});

test('preview paths use bundled content and optional errors do not hide the season', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async url => {
    assert.ok(!String(url).startsWith('https://'));
    return url === './src/data/set19.json' ? Response.json({ set: 19, units: [], traits: [] }) : new Response(null, {status:404});
  });
  const preview = './src/data/set19.json', missing = './src/data/set19.items.json';
  assert.deepEqual(await loadCatalogBundle([preview, missing], { optional: [missing] }), {
    values: [{ set: 19, units: [], traits: [] }, null], location: 'bundled',
  });
  assert.equal(fetch.mock.callCount(), 2);
});
