import assert from 'node:assert/strict';
import test from 'node:test';
import { screenEvidence } from '../src/engine/screen-insights.js';

const setData = { units: [], traits: [] };

test('reads explicit English and Chinese stage labels without treating dates or versions as rounds', () => {
  for (const line of ['Stage 2-1', 'Preview fixture | Stage 2-1', '回合｜阶段：２－１']) {
    assert.equal(screenEvidence(line, setData).stage, '2-1', line);
  }
  for (const line of ['Patch 2-1', 'Stage 2026-2-1', 'Stage 2-1.1', 'Stage 2-1 | Stage 2-2']) {
    assert.equal(screenEvidence(line, setData).stage, null, line);
  }
});
