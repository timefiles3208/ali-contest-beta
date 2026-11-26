import { renderLineupList } from './lineup-list.js?v=lineup-picker';

export function bindRecommendationFloat({ toggle, panel, status, ranked, onSelect, selectedId }) {
  const parent = panel.parentNode;
  const controls = document.createElement('div');
  controls.className = 'float-controls';
  const title = document.createElement('strong');
  title.textContent = '2-1 推荐';
  const fold = document.createElement('button');
  const close = document.createElement('button');
  for (const button of [fold, close]) { button.type = 'button'; button.className = 'ghost'; }
  fold.textContent = '收起';
  close.textContent = '关闭';
  const label = document.createElement('label');
  label.textContent = '透明度 ';
  const opacity = document.createElement('input');
  Object.assign(opacity, { type: 'range', min: '60', max: '100', value: '100' });
  label.append(opacity);
  const notice = document.createElement('p');
  notice.className = 'float-notice';
  notice.setAttribute('role', 'status');
  notice.hidden = true;
  const body = document.createElement('div');
  body.className = 'float-result';
  controls.append(title, fold, close);
  panel.append(controls, label, notice, body);
  let pip = null;

  function refresh() {
    if (panel.hidden) return;
    renderLineupList(body, ranked(), {
      label: '阵容方向', emptyHint: status.textContent, allowUnmatched: true,
      onSelect: comp => { if (pip) window.focus(); onSelect(comp); }, selectedId: selectedId(),
    });
  }
  function restore() {
    pip = null;
    panel.hidden = true;
    parent.append(panel);
    toggle.setAttribute('aria-expanded', 'false');
  }
  close.onclick = () => {
    pip?.close();
    restore();
  };
  fold.onclick = () => {
    const folded = panel.classList.toggle('float-folded');
    fold.textContent = folded ? '展开' : '收起';
    fold.setAttribute('aria-expanded', String(!folded));
  };
  opacity.oninput = () => { panel.style.opacity = String(Number(opacity.value) / 100); };
  toggle.onclick = async () => {
    if (!panel.hidden) { close.onclick(); return; }
    toggle.disabled = true;
    try {
      if (window.documentPictureInPicture) {
        pip = await window.documentPictureInPicture.requestWindow({ width: 410, height: 430 });
        pip.document.body.classList.add('float-window');
        for (const style of document.querySelectorAll('link[rel="stylesheet"]')) {
          const stylesheet = pip.document.createElement('link');
          stylesheet.rel = 'stylesheet';
          stylesheet.href = style.href;
          pip.document.head.append(stylesheet);
        }
        pip.document.title = '云顶 · 2-1 推荐';
        pip.document.body.append(panel);
        pip.addEventListener('pagehide', restore, { once: true });
      }
    } catch {
      pip?.close();
      restore();
    } finally {
      toggle.disabled = false;
    }
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    refresh();
  };
  new MutationObserver(refresh).observe(status, { childList: true });
  return {
    refresh,
    setNotice(text) {
      notice.textContent = text;
      notice.hidden = !text;
    },
  };
}
