import assert from 'node:assert/strict';
import test from 'node:test';
import { waitForVideoFrame, sameBoardFrame } from '../src/adapters/video-frame.js';

function videoStub() {
  let next, cancelled = false;
  return {
    videoWidth: 960, readyState: 4, currentTime: 1,
    requestVideoFrameCallback(callback) { next = callback; return 3; },
    cancelVideoFrameCallback() { cancelled = true; },
    publish(mediaTime) { next?.(0, { mediaTime }); },
    get cancelled() { return cancelled; },
  };
}

test('the screenshot uses a frame delivered after the previous video timestamp', async () => {
  const video = videoStub();
  let captures = 0;
  const result = waitForVideoFrame(video, () => ++captures, { timeout: 240 });
  video.publish(1);
  assert.equal(captures, 0);
  video.publish(1.1);
  assert.equal(await result, 1);
  assert.equal(captures, 1);
});

test('static and cancelled requests never screenshot the previous frame', async () => {
  const video = videoStub();
  let captures = 0;
  assert.equal(await waitForVideoFrame(video, () => ++captures, { timeout: 20 }), null);
  assert.equal(video.cancelled, true);
  const controller = new AbortController();
  const result = waitForVideoFrame(video, () => ++captures, { signal: controller.signal });
  controller.abort();
  video.publish(2);
  assert.equal(await result, null);
  assert.equal(captures, 0);
});

test('near-identical frames cannot be filed under a new opponent', () => {
  assert.equal(sameBoardFrame(new Uint8Array(24).fill(80), new Uint8Array(24).fill(83)), true);
  const changed = new Uint8Array(24).fill(80);
  changed.set(new Uint8Array(7).fill(115));
  assert.equal(sameBoardFrame(new Uint8Array(24).fill(80), changed), false);
});

test('fallback waits for a decoded frame counter to change', async () => {
  let totalVideoFrames = 10;
  const video = {
    currentTime: 1, videoWidth: 960, readyState: 4,
    getVideoPlaybackQuality: () => ({ totalVideoFrames }),
  };
  let captured = false;
  const result = waitForVideoFrame(video, () => { captured = true; return 'frame'; }, { timeout: 250 });
  video.currentTime = 2;
  assert.equal(captured, false);
  totalVideoFrames++;
  assert.equal(await result, 'frame');
});
