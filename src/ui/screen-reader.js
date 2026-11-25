import { renderLineupList } from './lineup-list.js?v=selected-augment-icons';
import { stageAfterOpening } from '../engine/screen-insights.js?v=video-ocr';
import { recognizeBoardText, warmOpeningOcr } from '../adapters/local-ocr.js?v=selected-augment-icons';
import { withinRecognitionBudget } from '../engine/recognition-budget.js';
const FRAME_INTERVAL_MS = 1000;
const CAPTURE_LIMIT_MS = 180_000;

function toCanvas(image, width, height, maxSize = 1600) {
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, maxSize / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function bindScreenReader({ start, finish, stop, photo, video, status, result, getContext, onEvidence, onOpening, isOpponentView }) {
  const supported = Boolean(navigator.mediaDevices?.getDisplayMedia);
  let active, finishedJob;
  let perspectiveRevision = 0;
  const say = (message) => { status.textContent = message; };
  const clearResult = () => {
    result.textContent = '';
    result.hidden = true;
  };

  function render() {
    start.disabled = !supported || Boolean(active || finishedJob);
    stop.disabled = !active;
    finish.disabled = !active?.stream || !video.videoWidth;
    photo.disabled = Boolean(active || finishedJob || isOpponentView());
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

  function frame(maxSize) {
    return video.videoWidth && video.readyState >= 2
      ? toCanvas(video, video.videoWidth, video.videoHeight, maxSize) : null;
  }

  function showDirection(context, note = '已按确认的开局条件匹配当前阵容库。') {
    const hasLineups = renderLineupList(result, context.ranked(), { label: '阵容方向', link: true });
    result.hidden = !hasLineups;
    if (!hasLineups) {
      say('请确认手上棋子、装备或城邦效果后查看阵容方向。');
      return;
    }

    say(note);
  }

  async function scan(session) {
    if (active !== session) return;
    const canvas = frame();
    const revision = perspectiveRevision;
    const opponent = isOpponentView();
    const retry = () => { session.tick = setTimeout(() => void scan(session), FRAME_INTERVAL_MS); };
    if (canvas) {
      try {
        const read = await withinRecognitionBudget(current => recognizeBoardText(
          canvas, session.context.setData, () => active === session && perspectiveRevision === revision && current(), {
            opening: opponent ? undefined : session.context.opening, fastOpening: true, stageOnly: opponent, readCards: !opponent && !session.cardsRead,
            onStage(stage) {
              if (opponent || perspectiveRevision !== revision || stage !== '2-1' || session.atOpening) return;
              session.atOpening = true;
              onOpening();
              say('检测到 2-1，正在补读本轮海克斯。');
            },
          },
        ), 14_000);
        if (active !== session) return;
        if (perspectiveRevision !== revision) { retry(); return; }
        const evidence = read.value;
        if (stageAfterOpening(evidence?.stage)) {
          release(session);
          if (session.atOpening) showDirection(session.context);
          else say('已读到 2-1 之后的阶段，屏幕读取已停止。');
          return;
        }
        if (opponent) {
          if (evidence?.stage === '2-1' && result.hidden) {
            if (session.context.ranked().some(row => row.viable || row.hasOpponentEvidence)) {
              showDirection(session.context, '已结合当前记录生成 2-1 阵容方向。');
            } else {
              say('检测到 2-1，正在共享对手视角。');
            }
          }
          retry();
          return;
        }
        if (evidence?.opening) onEvidence(evidence);
        if (evidence?.stage === '2-1' && evidence.opening?.offeredSlots?.every(Boolean)) session.cardsRead = true;
        if (read.timedOut) {
          showDirection(session.context, '画面识别暂未完成，已先按确认的开局条件给出方向。');
        } else {
          say(session.atOpening
            ? '检测到 2-1，可查看开局推荐。选完海克斯后结束共享。'
            : '正在读取画面文字，到 2-1 时会打开开局推荐。');
        }
      } catch {
        if (active !== session) return;
        if (perspectiveRevision !== revision || opponent) { retry(); return; }
        release(session);
        say('文字识别未能运行，请重试或导入截图。');
        return;
      }
    }
    if (active === session) retry();
  }

  async function readOpeningPhoto(file, context, job) {
    const read = await withinRecognitionBudget(async (current) => {
      const bitmap = await createImageBitmap(file);
      try {
        if (finishedJob !== job || !current()) return null;
        return await recognizeBoardText(toCanvas(bitmap, bitmap.width, bitmap.height, 2160), context.setData,
          () => finishedJob === job && current(), { fastOpening: true, opening: context.opening });
      } finally {
        bitmap.close();
      }
    });
    if (finishedJob !== job) return;
    if (read.timedOut) {
      showDirection(context, '截图识别已到等待上限，已先按确认的开局条件给出方向。');
      return;
    }
    const evidence = read.value;
    if (evidence?.stage !== '2-1') {
      say(evidence?.stage
        ? `截图读到 ${evidence.stage}。请导入 2-1 的海克斯选择画面。`
        : '未确认 2-1 回合。请使用包含完整回合栏的原图，或手动打开开局推荐。');
      return;
    }
    onEvidence(evidence);
    onOpening();
    showDirection(context);
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
    void warmOpeningOcr().catch(() => {});
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
      say(isOpponentView() ? '已共享，可从对手视角读取当前一帧。' : '正在加载中文识别组件…');
      void scan(session);
    } catch (error) {
      if (active !== session) return;
      release(session);
      say(error.name === 'NotAllowedError' ? '未开始共享，可重新选择游戏窗口或导入截图。' : '无法开始共享，请用桌面浏览器直接打开测试站，或导入截图。');
    }
  };

  finish.onclick = () => {
    if (!active?.stream) return;
    const { context } = active;
    release(active);
    showDirection(context);
  };
  stop.onclick = () => {
    if (active) release(active);
    say('屏幕共享已停止。');
  };
  photo.onchange = async () => {
    const file = photo.files[0];
    photo.value = '';
    if (!file || active || finishedJob || isOpponentView()) return;
    const context = getContext();
    if (!context) { say('请等当前数据源的阵容库载入。'); return; }
    if (file.size > 20 * 1024 * 1024) { say('请选择 20 MB 以内的截图。'); return; }
    clearResult();
    const job = {};
    finishedJob = job;
    render();
    try {
      say('正在读取 2-1 截图…');
      await readOpeningPhoto(file, context, job);
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
  return {
    reset,
    getFrame: () => active?.stream ? frame(1920) : null,
    perspectiveChanged() {
      perspectiveRevision++;
      render();
      if (active?.stream) say(isOpponentView() ? '可从对手视角读取当前一帧。' : '已切回我的视角。');
    },
    refreshDirection() {
      if (result.hidden) return;
      const context = getContext();
      result.hidden = !context || !renderLineupList(result, context.ranked(), { label: '阵容方向', link: true });
    },
  };
}
