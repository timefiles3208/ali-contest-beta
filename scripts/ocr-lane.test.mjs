import assert from 'node:assert/strict';
import test from 'node:test';
import { createOcrLane } from '../src/adapters/ocr-lane.js';

function fixture() {
  const calls = [];
  const engine = {
    async setParameters(options) { calls.push(options); },
    async recognize(image) { return { data: { text: image } }; },
  };
  return { calls, engine };
}

test('reuses parameters and skips cancelled jobs before recognition', async () => {
  const { calls, engine } = fixture();
  const lane = createOcrLane(async () => engine);
  assert.equal(await lane.read('first', () => true), 'first');
  assert.equal(await lane.read('second', () => true), 'second');
  assert.equal(await lane.read('obsolete', () => false, '6'), null);
  assert.equal(calls.length, 1);
  assert.equal(await lane.read('card', () => true, '7'), 'card');
  assert.equal(calls.length, 2);
});

test('a slow scout does not hold the opening lane', async () => {
  const { engine } = fixture();
  let resolveScout;
  const scout = createOcrLane(() => new Promise(resolve => { resolveScout = resolve; }));
  const opening = createOcrLane(async () => engine);
  const waiting = scout.read('opponent', () => true);
  assert.equal(await opening.read('2-1', () => true), '2-1');
  resolveScout(engine);
  assert.equal(await waiting, 'opponent');
});

test('a failed worker initialization can be retried without keeping a rejected worker', async () => {
  const { engine } = fixture();
  let tries = 0;
  const lane = createOcrLane(async () => {
    if (++tries === 1) throw Error('startup error');
    return engine;
  });
  await assert.rejects(lane.read('first', () => true), /startup error/);
  assert.equal(await lane.read('next', () => true), 'next');
});
