import { renderLineupList } from './lineup-list.js?v=scout-direction';
import { stageAfterOpening } from '../engine/screen-insights.js?v=video-ocr';
import { recognizeBoardText, warmOpeningOcr, warmScoutOcr } from '../adapters/local-ocr.js?v=game-release-scope';
import { withinRecognitionBudget } from '../engine/recognition-budget.js';
import { boardFrameStamp, sameBoardFrame, waitForVideoFrame } from '../adapters/video-frame.js';
const FRAME_INTERVAL_MS = 400;
const SCOUT_STAGE_INTERVAL_MS = 950;
const DIRECTION_FALLBACK_MS = 16_000;
const CAPTURE_LIMIT_MS = 180_000;
const directionOptions = context => ({
  label: '阵容方向', link: true, allowUnmatched: true, onSelect: context.onSelect, selectedId: context.selectedId(),
});

function toCanvas(image, width, height, maxSize = 1600) {
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, maxSize / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function bindScreenReader({ start, finish, stop, photo, video, status, result, getContext, onEvidence, onOpening, onLiveOpening, onOpeningEnd, onEarlyStage, onShareStart, isOpponentView }) {
  const supported = Boolean(navigator.mediaDevices?.getDisplayMedia);
  let active, finishedJob;
  let perspectiveRevision = 0;
  const thumbnail = document.createElement('canvas');
  thumbnail.width = 12;
  thumbnail.height = 8;
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
    clearTimeout(session.directionFallback);
    session.frameRequest?.abort();
    session.scanFrame?.abort();
    session.stream?.getTracks().forEach(track => track.stop());
    video.srcObject = null;
    video.hidden = true;
    if (session.atOpening) onOpeningEnd();
    render();
  }

  function frame(maxSize) {
    return video.videoWidth && video.readyState >= 2
      ? toCanvas(video, video.videoWidth, video.videoHeight, maxSize) : null;
  }

  async function captureScoutFrame(slot) {
    const session = active;
    if (!session?.stream || !session.scopeChecked) return null;
    const revision = perspectiveRevision;
    session.frameRequest?.abort();
    const request = new AbortController();
    session.frameRequest = request;
    const previous = session.scoutFrame;
    const reject = previous?.slot !== slot ? previous?.stamp : null;
    const take = () => {
      if (session !== active || perspectiveRevision !== revision || request.signal.aborted || !video.videoWidth || video.readyState < 2) return null;
      const stamp = boardFrameStamp(video, thumbnail);
      if (sameBoardFrame(reject, stamp)) return null;
      const canvas = frame(1920);
      return canvas ? { canvas, stamp } : null;
    };
    // An already presented distinct view is usable even if the sharing tab is now static.
    const captured = (reject && take())
      || await waitForVideoFrame(video, take, { timeout: reject ? 700 : 320, signal: request.signal })
      || take();
    if (!captured || session !== active || perspectiveRevision !== revision) return null;
    session.scoutFrame = { slot, stamp: captured.stamp };
    return captured;
  }

  function showDirection(context, note = '已按确认的开局条件匹配当前阵容库。') {
    const hasLineups = renderLineupList(result, context.ranked(), directionOptions(context));
    result.hidden = !hasLineups;
    if (!hasLineups) {
      say('请确认手上棋子、装备或城邦效果后查看阵容方向。');
      return;
    }

    say(note);
  }

  async function scan(session) {
    if (active !== session) return;
    session.tick = null;
    const revision = perspectiveRevision;
    const opponent = isOpponentView();
    const retry = () => {
      if (active !== session) return;
      const delay = revision !== perspectiveRevision ? 0 : opponent ? SCOUT_STAGE_INTERVAL_MS : FRAME_INTERVAL_MS;
      session.tick = setTimeout(() => void scan(session), delay);
    };
    const nextFrame = session.lastPerspective !== revision;
    session.lastPerspective = revision;
    let canvas = null;
    if (nextFrame) {
      const request = new AbortController();
      session.scanFrame = request;
      canvas = await waitForVideoFrame(video, frame, { timeout: 400, signal: request.signal });
      if (active !== session) return;
      if (revision !== perspectiveRevision) { retry(); return; }
    } else {
      canvas = frame();
    }
    if (canvas) {
      try {
        const read = await withinRecognitionBudget(current => recognizeBoardText(
          canvas, session.context.setData, () => active === session && perspectiveRevision === revision && current(), {
            opening: opponent ? undefined : session.context.opening, fastOpening: true, stageOnly: opponent, readCards: !opponent && !session.cardsRead,
            checkScope: !session.scopeChecked,
            readShop: !opponent && session.context.readShop,
            onProgress(evidence) {
              if (!opponent && active === session && perspectiveRevision === revision && evidence.opening) onEvidence(evidence);
            },
            onStage(stage) {
              if (active !== session || opponent || perspectiveRevision !== revision || stage !== '2-1' || session.atOpening) return;
              session.atOpening = true;
              onLiveOpening();
              showDirection(session.context, '检测到 2-1，正在补读本轮海克斯。');
            },
          },
        ), 14_000);
        if (active !== session) return;
        if (perspectiveRevision !== revision) { retry(); return; }
        const evidence = read.value;
        if (evidence?.scopeMismatch) {
          release(session);
          clearResult();
          say(evidence.scopeMismatch);
          return;
        }
        if (evidence) session.scopeChecked = true;
        if (stageAfterOpening(evidence?.stage)) {
          release(session);
          if (session.atOpening) showDirection(session.context);
          else {
            onOpeningEnd();
            say('已读到 2-1 之后的阶段，屏幕读取已停止。');
          }
          return;
        }
        if (!opponent && !session.atOpening && !session.earlyStageSeen && /^1-\d+$/.test(evidence?.stage || '')) {
          session.earlyStageSeen = true;
          onEarlyStage();
        }
        if (opponent) {
          if (evidence?.stage === '2-1' && result.hidden) {
            showDirection(session.context, '检测到 2-1，已按当前记录给出阵容方向。');
          }
          retry();
          return;
        }
        if (evidence?.opening || evidence?.shop) onEvidence(evidence);
        if (evidence?.stage === '2-1' && evidence.opening?.offeredSlots?.every(Boolean)) session.cardsRead = true;
        if (read.timedOut) {
          showDirection(session.context, '画面读取暂未完成，已按当前确认的开局信息提供阵容参考。');
        } else {
          say(session.atOpening
            ? '检测到 2-1，可查看开局推荐。选完海克斯后结束共享。'
            : result.hidden ? '正在读取画面文字，到 2-1 时会提示开局推荐。'
              : '尚未确认 2-1，已显示阵容参考，正在继续读取画面。');
        }
      } catch {
        if (active !== session) return;
        if (perspectiveRevision !== revision || opponent) { retry(); return; }
        release(session);
        showDirection(session.context, '画面文字识别失败，已显示阵容参考。可重新共享或导入截图。');
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
          () => finishedJob === job && current(), { fastOpening: true, checkScope: true, opening: context.opening, readShop: context.readShop });
      } finally {
        bitmap.close();
      }
    });
    if (finishedJob !== job) return;
    if (read.timedOut) {
      showDirection(context, '截图校验超时，未使用这张图。已按当前手动记录提供阵容参考。');
      return;
    }
    const evidence = read.value;
    if (evidence?.scopeMismatch) {
      clearResult();
      say(evidence.scopeMismatch);
      return;
    }
    if (evidence?.stage?.startsWith('1-') && evidence.shop) {
      onEvidence(evidence);
      onOpening(evidence.stage);
      say('已读取开局等级和金币，可在推荐面板核对并应用。');
      return;
    }
    if (evidence?.stage !== '2-1') {
      if (stageAfterOpening(evidence?.stage)) onOpeningEnd();
      if (evidence?.stage) say(`截图读到 ${evidence.stage}。请导入 2-1 的海克斯选择画面。`);
      else showDirection(context, '截图未确认 2-1，已显示阵容参考。可导入包含回合栏的原图继续识别。');
      return;
    }
    onEvidence(evidence);
    onOpening(evidence.stage);
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
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 8, max: 12 } }, audio: false });
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
      session.directionFallback = setTimeout(() => {
        if (active !== session || !result.hidden) return;
        showDirection(context, session.atOpening
          ? '已按当前记录给出 2-1 阵容方向，识别结果会继续补充。'
          : '尚未确认 2-1，先显示阵容参考。检测到 2-1 后会提示查看推荐。');
      }, DIRECTION_FALLBACK_MS);
      video.srcObject = stream;
      video.hidden = false;
      void warmScoutOcr().catch(() => {});
      await video.play();
      if (active !== session) return;
      onShareStart();
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
    const session = active;
    release(session);
    if (!session.atOpening) onOpeningEnd();
    showDirection(session.context);
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
  const preparePhotoReader = () => { void warmOpeningOcr().catch(() => {}); };
  photo.addEventListener('pointerenter', preparePhotoReader, { once: true });
  photo.addEventListener('focus', preparePhotoReader, { once: true });
  if (!navigator.connection?.saveData) {
    if (window.requestIdleCallback) window.requestIdleCallback(preparePhotoReader, { timeout: 800 });
    else setTimeout(preparePhotoReader, 800);
  }
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
    hasSharedStream: () => Boolean(active?.stream),
    getFrame: captureScoutFrame,
    perspectiveChanged() {
      perspectiveRevision++;
      active?.frameRequest?.abort();
      active?.scanFrame?.abort();
      if (active?.stream && active.tick != null) {
        clearTimeout(active.tick);
        void scan(active);
      }
      render();
      if (active?.stream) say(isOpponentView() ? '可从对手视角读取当前一帧。' : '已切回我的视角。');
    },
    refreshDirection() {
      if (result.hidden) return;
      const context = getContext();
      result.hidden = !context || !renderLineupList(result, context.ranked(), directionOptions(context));
    },
  };
}
