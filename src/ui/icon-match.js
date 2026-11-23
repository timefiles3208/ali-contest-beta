import { recognizeCroppedIcon } from '../adapters/icon-match.js';

export function bindIconMatch({ kind, input, status, apply, getContext, onApply }) {
  let candidate, revision = 0;

  function reset() {
    revision++;
    candidate = null;
    input.value = '';
    apply.disabled = true;
    status.textContent = '上传裁好的单个图标，核对结果后应用。';
  }

  kind.onchange = reset;
  input.onchange = async () => {
    const [file] = input.files;
    reset();
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      status.textContent = '请上传 5 MB 以内的图标。';
      return;
    }
    const context = getContext(kind.value);
    if (!context?.entries.length) {
      status.textContent = '当前赛季的图标尚未就绪。';
      return;
    }
    const job = revision;
    status.textContent = '正在匹配当前赛季的图标…';
    try {
      const result = await recognizeCroppedIcon(file, context.entries, context.version);
      if (job !== revision) return;
      candidate = result;
      apply.disabled = !candidate;
      status.textContent = candidate
        ? `候选：${candidate.name}。请核对后应用。`
        : '没有足够明确的匹配。请去掉边框和背景，或改用文字识别。';
    } catch (error) {
      if (job === revision) status.textContent = error instanceof DOMException
        ? '无法读取图标或模板请求超时。'
        : '无法完成匹配。请上传近似正方形、至少 16×16 像素的完整图标，并检查网络。';
    }
  };

  apply.onclick = () => {
    if (!candidate) return;
    const name = candidate.name;
    onApply(candidate, kind.value);
    candidate = null;
    apply.disabled = true;
    status.textContent = `已登记 ${name}。`;
  };
  reset();
  return { reset };
}
