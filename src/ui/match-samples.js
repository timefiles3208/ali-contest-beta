import { aggregateTftMatches, unpackMatchFile } from '../engine/match-samples.js?v=match-variants';

const MAX_IMPORT_BYTES = 15 * 1024 * 1024;

export function bindMatchSamples({ panel, input, clear, status, output, getContext }) {
  let report, revision = 0, busy = false;

  function refresh() {
    const context = getContext();
    panel.hidden = !context;
    input.disabled = !context || busy;
    clear.disabled = !report && !busy;
  }

  function table(report, setData) {
    const list = document.createElement('ol');
    const names = new Map(setData.units.map(unit => [unit.id, unit.name]));
    for (const row of report.comps) {
      const li = document.createElement('li');
      const enough = row.samples >= 10;
      li.textContent = `${row.name} · ${row.samples} 个终局棋盘 · 前四 ${row.top4}% · 登顶 ${row.first}% · 平均 ${row.average} 名${enough ? '' : ' · 样本较少'}`;
      if (row.variants.length) {
        const details = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = '查看终局阵容变体';
        const variants = document.createElement('ul');
        for (const variant of row.variants) {
          const item = document.createElement('li');
          const level = variant.level === null ? '等级未记录' : `终局 ${variant.level} 级`;
          const lineup = variant.units.map(id => names.get(id) || id).join('、');
          item.textContent = `${level} · ${lineup} · ${variant.samples} 个棋盘 · 平均 ${variant.average} 名`;
          variants.append(item);
        }
        details.append(summary, variants);
        li.append(details);
      }
      list.append(li);
    }
    output.replaceChildren(list);
  }

  clear.onclick = () => {
    revision++;
    busy = false;
    report = null;
    input.value = '';
    output.replaceChildren();
    status.textContent = '可以导入同版本的已结束排位记录。';
    refresh();
  };

  input.onchange = async () => {
    const files = [...input.files];
    const context = getContext();
    input.value = '';
    if (!context || !files.length) return;
    if (files.reduce((sum, file) => sum + file.size, 0) > MAX_IMPORT_BYTES) {
      status.textContent = '本次文件总大小请控制在 15 MB 以内。';
      return;
    }
    const job = ++revision;
    busy = true;
    status.textContent = '正在核对赛季、版本和重复对局…';
    refresh();
    try {
      const batch = await Promise.all(files.map(async file => unpackMatchFile(JSON.parse(await file.text()))));
      if (job !== revision) return;
      if (getContext()?.comps !== context.comps) {
        status.textContent = '阵容库已切换，请重新导入。';
        return;
      }
      report = aggregateTftMatches(batch.flat(), context);
      const skipped = report.duplicates + report.versionSkipped + report.queueSkipped + report.invalid;
      status.textContent = report.matches
        ? `读取 ${report.matches} 局排位，匹配 ${report.matchedBoards} 个终局棋盘，跳过 ${skipped} 局。`
        : `没有通过校验的 S18 18.7 排位对局，跳过 ${skipped} 局。`;
      table(report, context.setData);
    } catch {
      if (job === revision) status.textContent = '无法导入。请选择包含 Riot TFT 对局详情的 JSON 文件。';
    } finally {
      if (job === revision) {
        busy = false;
        refresh();
      }
    }
  };
  refresh();
  return { refresh };
}
