export function createOcrLane(loadWorker) {
  let worker, mode, whitelist;
  let pending = Promise.resolve();

  function warm() {
    worker ??= Promise.resolve().then(loadWorker).catch(error => {
      worker = undefined;
      throw error;
    });
    return worker;
  }

  function read(canvas, isCurrent, nextMode = '11', nextWhitelist = '') {
    const job = pending.then(async () => {
      if (!isCurrent()) return null;
      const engine = await warm();
      if (!isCurrent()) return null;
      if (mode !== nextMode || whitelist !== nextWhitelist) {
        await engine.setParameters({ tessedit_pageseg_mode: nextMode, tessedit_char_whitelist: nextWhitelist });
        mode = nextMode;
        whitelist = nextWhitelist;
      }
      if (!isCurrent()) return null;
      const { data } = await engine.recognize(canvas);
      return isCurrent() ? data.text : null;
    });
    pending = job.catch(() => {});
    return job;
  }

  return { warm, read };
}
