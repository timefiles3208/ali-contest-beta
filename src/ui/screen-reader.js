import { stageAfterOpening } from '../engine/screen-insights.js?v=video-ocr';
import { recognizeBoardText } from '../adapters/local-ocr.js?v=video-ocr';
const FRAME_INTERVAL_MS = 3500;
const CAPTURE_LIMIT_MS = 180_000;

function toCanvas(image, width, height, maxSize = 1600) {
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, maxSize / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function bindScreenReader({ start, finish, stop, photo, video, status, result, getContext, onEvidence, onOpening }) {
  const supported = Boolean(navigator.mediaDevices?.getDisplayMedia);
  let active, finishedJob;
  const say = (message) => { status.textContent = message; };
  const clearResult = () => {
    result.textContent = '';
    result.hidden = true;
  };

  function render() {
    start.disabled = !supported || Boolean(active || finishedJob);
    stop.disabled = !active;
    finish.disabled = !active?.stream || !video.videoWidth;
    photo.disabled = Boolean(active || finishedJob);
  }

  function release(session) {
    if (session !== active) return;
    active = null;
    clearTimeout(session.tick);
    clearTimeout(session.limit);
    session.stream?.getTracks().forEach(track => track.stop());
    video.srcObject = null;
    video.hidden = true;
    render();
  }

  function frame() {
    return video.videoWidth && video.readyState >= 2
      ? toCanvas(video, video.videoWidth, video.videoHeight) : null;
  }

  function showDirection(context) {
    const comp = context.direction();
    if (!comp) {
      say('请确认手上棋子、装备或城邦效果后查看阵容方向。');
      return;
    }
    result.textContent = `阵容方向 · ${comp.name}`;
    result.hidden = false;
    say('已按确认的开局条件匹配当前阵容库。');
  }

  async function scan(session) {
    if (active !== session) return;
    const canvas = frame();
    if (canvas) {
      try {
        const evidence = await recognizeBoardText(canvas, session.context.setData, () => active === session, {
          opening: session.context.opening, readCards: !session.cardsRead,
        });
        if (!evidence || active !== session) return;
        if (stageAfterOpening(evidence.stage)) {
          release(session);
          if (session.atOpening) showDirection(session.context);
          else say('已读到 2-1 之后的阶段，屏幕读取已停止。');
          return;
        }
        onEvidence(evidence);
        if (evidence.stage === '2-1' && evidence.opening?.offeredSlots?.every(Boolean)) session.cardsRead = true;
        if (evidence.stage === '2-1' && !session.atOpening) {
          session.atOpening = true;
          onOpening();
        }
        say(session.atOpening
          ? '检测到 2-1，可查看开局推荐。选完海克斯后结束共享。'
          : '正在读取画面文字，到 2-1 时会打开开局推荐。');
      } catch {
        if (active !== session) return;
        release(session);
        say('文字识别未能运行，请重试或导入截图。');
        return;
      }
    }
    if (active === session) session.tick = setTimeout(() => void scan(session), FRAME_INTERVAL_MS);
  }

  async function recognizeFinal(context, canvas, fromScreenshot = false) {
    const job = {};
    finishedJob = job;
    render();
    say('正在读取最后一帧的文字…');
    try {
      const evidence = await recognizeBoardText(canvas, context.setData, () => finishedJob === job, { detailed: true, opening: context.opening });
      if (!evidence || finishedJob !== job) return;
      if (fromScreenshot && evidence.stage !== '2-1') {
        say(evidence.stage
          ? `截图读到 ${evidence.stage}。请导入 2-1 的海克斯选择画面。`
          : '未确认 2-1 回合。请使用包含完整回合栏的原图，或手动打开开局推荐。');
        return;
      }
      if (!stageAfterOpening(evidence.stage)) onEvidence(evidence);
      if (fromScreenshot) onOpening();
      showDirection(context);
    } catch {
      if (finishedJob === job) say('无法识别这张画面，请重试或选一张清晰截图。');
    } finally {
      if (finishedJob === job) {
        finishedJob = null;
        render();
      }
    }
  }

  start.onclick = async () => {
    const context = getContext();
    if (!supported || active || finishedJob) return;
    if (!context) { say('请等当前数据源的阵容库载入。'); return; }
    clearResult();
    const session = { context };
    active = session;
    render();
    say('请选择游戏窗口。');
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 2, max: 5 } }, audio: false });
      if (active !== session) { stream.getTracks().forEach(track => track.stop()); return; }
      session.stream = stream;
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error('未获得共享画面。');
      track.addEventListener('ended', () => {
        if (active !== session) return;
        release(session);
        say('浏览器已停止共享。');
      }, { once: true });
      session.limit = setTimeout(() => {
        if (active !== session) return;
        release(session);
        say('已到读取时限，屏幕共享已停止。');
      }, CAPTURE_LIMIT_MS);
      video.srcObject = stream;
      video.hidden = false;
      await video.play();
      if (active !== session) return;
      render();
      say('正在加载中文识别组件…');
      void scan(session);
    } catch (error) {
      if (active !== session) return;
      release(session);
      say(error.name === 'NotAllowedError' ? '未开始共享，可重新选择游戏窗口或导入截图。' : '无法开始共享，请用桌面浏览器直接打开测试站，或导入截图。');
    }
  };

  finish.onclick = () => {
    if (!active?.stream) return;
    const canvas = frame();
    if (!canvas) return;
    const { context } = active;
    release(active);
    void recognizeFinal(context, canvas);
  };
  stop.onclick = () => {
    if (active) release(active);
    say('屏幕共享已停止。');
  };
  photo.onchange = async () => {
    const file = photo.files[0];
    photo.value = '';
    if (!file || active || finishedJob) return;
    const context = getContext();
    if (!context) { say('请等当前数据源的阵容库载入。'); return; }
    if (file.size > 20 * 1024 * 1024) { say('请选择 20 MB 以内的截图。'); return; }
    clearResult();
    const job = {};
    finishedJob = job;
    render();
    try {
      const bitmap = await createImageBitmap(file);
      try {
        if (finishedJob !== job) return;
        await recognizeFinal(context, toCanvas(bitmap, bitmap.width, bitmap.height, 2160), true);
      } finally { bitmap.close(); }
    } catch {
      if (finishedJob === job) say('无法读取图片，请选择清晰的 PNG 或 JPG 截图。');
    } finally {
      if (finishedJob === job) { finishedJob = null; render(); }
    }
  };
  video.addEventListener('loadeddata', render);
  const reset = () => {
    if (active) release(active);
    finishedJob = null;
    clearResult();
    say(supported ? '共享游戏窗口，或导入 2-1 截图。' : '当前浏览器无法共享游戏窗口。可以导入 2-1 截图识别。');
    render();
  };
  addEventListener('pagehide', reset);
  reset();
  return { reset };
}
