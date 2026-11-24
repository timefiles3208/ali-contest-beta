import assert from 'node:assert/strict';
import test from 'node:test';
import { RECOGNITION_BUDGET_MS, withinRecognitionBudget } from '../src/engine/recognition-budget.js';

test('recognition has room to render before the 20-second limit', async () => {
  assert.ok(RECOGNITION_BUDGET_MS < 20_000);
  let isCurrent;
  const result = await withinRecognitionBudget(current => {
    isCurrent = current;
    return new Promise(() => {});
  }, 15);
  assert.deepEqual(result, { timedOut: true });
  assert.equal(isCurrent(), false);
});

test('a completed read returns its data and errors still propagate', async () => {
  assert.deepEqual(await withinRecognitionBudget(() => '2-1', 100), { value: '2-1', timedOut: false });
  await assert.rejects(withinRecognitionBudget(() => { throw new Error('model failed'); }, 100), /model failed/);
});
