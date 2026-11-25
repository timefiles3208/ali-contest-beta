export function waitForVideoFrame(video, capture, { timeout = 800, signal } = {}) {
  if (signal?.aborted) return Promise.resolve(null);
  const baseline = video.currentTime;
  const frameCount = video.getVideoPlaybackQuality?.().totalVideoFrames;
  return new Promise(resolve => {
    let handle, timer, poll, done = false;
    const finish = value => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearInterval(poll);
      if (handle != null) video.cancelVideoFrameCallback?.(handle);
      signal?.removeEventListener('abort', abort);
      resolve(value);
    };
    const abort = () => finish(null);
    const read = () => {
      if (done || !video.videoWidth || video.readyState < 2) return;
      const frame = capture();
      if (frame != null) finish(frame);
    };
    const onFrame = (_, { mediaTime }) => {
      handle = null;
      if (mediaTime > baseline) read();
      if (!done) handle = video.requestVideoFrameCallback(onFrame);
    };
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(abort, timeout);
    if (video.requestVideoFrameCallback) handle = video.requestVideoFrameCallback(onFrame);
    // Hidden tabs can throttle presentation callbacks while the shared track still decodes.
    poll = setInterval(() => {
      const presented = video.getVideoPlaybackQuality?.().totalVideoFrames;
      if ((presented != null && frameCount != null && presented > frameCount) ||
          (!video.requestVideoFrameCallback && presented == null && video.currentTime > baseline)) read();
    }, 40);
  });
}

export function boardFrameStamp(video, canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { videoWidth: w, videoHeight: h } = video;
  ctx.drawImage(video, w * 0.13, h * 0.11, w * 0.74, h * 0.71, 0, 0, canvas.width, canvas.height);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return Uint8Array.from({ length: data.length / 4 }, (_, i) =>
    Math.round(data[i * 4] * 0.3 + data[i * 4 + 1] * 0.59 + data[i * 4 + 2] * 0.11));
}

export function sameBoardFrame(previous, next) {
  if (!previous || previous.length !== next.length) return false;
  let diff = 0, changed = 0;
  for (let i = 0; i < next.length; i++) {
    const delta = Math.abs(previous[i] - next[i]);
    diff += delta;
    if (delta >= 10) changed++;
  }
  return diff / next.length < 3 || changed < Math.max(3, next.length * 0.045);
}
