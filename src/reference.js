import { BOARD_SOURCES, adaptBoard, boardStat, sourceFor } from './adapters/board-sources.js?v=live-catalog';
import { loadCatalogBundle } from './adapters/catalog.js?v=bounded-fallback';
import { SETS, findSet } from './data/sets.js?v=game-release-scope';
import { augmentTier, AUGMENT_TIER_LABELS } from './data/augment-tiers.js';
import { catalogName, compareCatalogEntries } from './engine/catalog-comparison.js?v=postgame-icons';
import { iconHtml } from './ui/helpers.js?v=game-release-scope';

const el = id => document.getElementById(id);
const h = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const PAGE_SIZE = 24;
const tiers = ['S+', 'S', 'A', 'B', 'C', 'D'];
const tierOrder = new Map(tiers.map((tier, index) => [tier, index]));
const time = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const locations = { live: '同步快照', database: '备用快照', bundled: '随站快照' };
let releaseId = 0;
let catalog;
let comparisons;
let scope;
let shown = PAGE_SIZE;
let postgame;

function preference(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch { /* Use the current selection when storage is unavailable. */ }
}

const sourceInput = el('boardSource');
const versionInput = el('setSelect');
const categoryInput = el('referenceCategory');
const searchInput = el('referenceSearch');
const matchInput = el('referenceMatch');
const output = el('referenceResults');
const showMore = el('showMore');
sourceInput.replaceChildren(...BOARD_SOURCES.map(({ id, game }) => new Option(game, id)), new Option('云顶与金铲铲对照', 'compare'));
const savedSource = preference('tft-board-source');
sourceInput.value = savedSource === 'compare' ? savedSource : sourceFor(savedSource).id;
versionInput.replaceChildren(...SETS.map(meta => new Option(`${meta.version} · ${meta.label}`, meta.version)));
versionInput.value = findSet(preference('tft-board-release'))?.version || SETS[0].version;

function image(entry, catalog, size = 28) {
  const sprite = entry.sprite;
  const version = catalog.roster.source?.ddragonVersion;
  const validSprite = sprite && /^\d+\.\d+\.\d+$/.test(version) && /^[\w-]+\.png$/.test(sprite.file) &&
    Number.isInteger(sprite.x) && Number.isInteger(sprite.y);
  return entry.icon || validSprite ? iconHtml({ icon: entry.icon, sprite: validSprite ? sprite : null }, version, size) : '';
}

function lineupCard(comp, catalog) {
  const { byUnit, byItem, byTrait } = catalog;
  const stats = [comp.rank.tier && `${comp.rank.tier} 级`,
    comp.rank.top4 != null && `前四 ${comp.rank.top4}%`, comp.rank.first != null && `登顶 ${comp.rank.first}%`,
    comp.rank.avg != null && `均位 ${comp.rank.avg.toFixed(2)}`, comp.rank.appear != null && `出场 ${comp.rank.appear}%`,
    comp.rank.samples != null && `样本 ${comp.rank.samples}`].filter(Boolean);
  const traits = Object.entries(comp.aimTraits).map(([id, tier]) => `${byTrait.get(id)?.name || id} ${tier}`);
  return `<details class="reference-lineup">
    <summary><strong>${h(comp.name)}</strong>${stats.length ? `<span>${h(stats.join(' · '))}</span>` : ''}</summary>
    <div class="reference-lineup-detail">
      ${traits.length ? `<p class="fine">${h(traits.join(' · '))}</p>` : ''}
      <ul class="reference-units">${comp.units.map(id => {
        const unit = byUnit.get(id);
        const gear = (comp.itemBuilds[id] || []).map(item => byItem.get(item)?.name).filter(Boolean);
        return `<li>${image(unit, catalog)}<div>${h(unit.name)}${comp.stars[id] ? ` · ${comp.stars[id]} 星` : ''}${gear.length ? `<small>${h(gear.join('、'))}</small>` : ''}</div></li>`;
      }).join('')}</ul>
      ${comp.teamCode ? `<label class="reference-code">阵容码 <input readonly value="${h(comp.teamCode)}" /></label>` : ''}
    </div>
  </details>`;
}

function entryCard(entry, category, catalog) {
  const { board, byItem, byTrait } = catalog;
  const notes = {
    units: () => [`${entry.cost} 费`, ...(entry.traits || []).map(trait => byTrait.get(trait)?.name)],
    traits: () => (entry.tiers || []).map(tier => `${tier.min} 人`),
    items: () => [boardStat(board.items, entry.name), (entry.from || []).map(id => byItem.get(id)?.name).filter(Boolean).join(' + ')],
    augments: () => [AUGMENT_TIER_LABELS[augmentTier(entry.id)], boardStat(board.augments, entry.name)],
  }[category]().filter(Boolean);
  return `<article class="reference-card"><div class="reference-card-title">${image(entry, catalog, 32)}<strong>${h(entry.name)}</strong></div>
    ${notes.length ? `<p class="fine">${h(notes.join(' · '))}</p>` : ''}
    ${entry.desc ? `<p>${h(entry.desc)}</p>` : ''}</article>`;
}

function sourceDetails(data, source) {
  const date = new Date(data.updatedAt || data.board.extractedAt);
  const updated = Number.isFinite(date.getTime()) ? ` · ${time.format(date)}` : '';
  return `<a href="https://${h(source.host)}/" target="_blank" rel="noopener noreferrer">${h(source.host)}</a> · ${h(data.roster.scope.version)} · ${h(locations[data.location])}${h(updated)}`;
}

function renderComparison(category, query) {
  const [left, right] = comparisons;
  const lineups = category === 'lineups';
  const canFilter = Boolean(left.data && right.data) && !lineups;
  el('comparisonFilter').hidden = !canFilter;
  const headers = comparisons.map(({ source, data, message }) => `<header class="comparison-source">
    <h3>${h(source.game)}</h3><p class="fine">${data ? sourceDetails(data, source) : `${h(source.host)} · ${h(message)}`}</p>
  </header>`).join('');
  output.classList.add('comparison-grid');
  output.classList.remove('reference-entries');
  if (lineups) {
    const rows = comparisons.map(column => (column.data?.lineups || []).filter(entry => catalogName(entry.name).includes(query)));
    output.innerHTML = `<div class="comparison-row">${headers}</div>` + comparisons.map(({ data }, index) => `<div class="comparison-column">${
      rows[index].slice(0, shown).map(entry => lineupCard(entry, data)).join('') || (data ? '<p class="fine">未找到符合条件的阵容。</p>' : '')
    }</div>`).join('');
    el('referenceCount').textContent = comparisons.map(({ source, data }, i) => `${source.game} ${data ? rows[i].length + ' 套' : '暂无数据'}`).join(' · ');
    showMore.hidden = Math.max(...rows.map(entries => entries.length)) <= shown;
    return;
  }
  const pairs = compareCatalogEntries(left.data?.[category] || [], right.data?.[category] || [], query,
    canFilter ? matchInput.value : 'all', { category, version: versionInput.value });
  function cell(entries, column) {
    if (entries.length) return `<div class="comparison-column">${entries.map(entry => entryCard(entry, category, column.data)).join('')}</div>`;
    return `<p class="fine comparison-empty">${column.data ? '此版本未收录同名条目' : h(column.message)}</p>`;
  }
  output.innerHTML = `<div class="comparison-row">${headers}</div>` + pairs.slice(0, shown).map(pair =>
    `<div class="comparison-row">${cell(pair.left, left)}${cell(pair.right, right)}</div>`).join('');
  el('referenceCount').textContent = pairs.length ? `共 ${pairs.length} 个名称` : '暂无符合条件的资料';
  showMore.hidden = pairs.length <= shown;
}

function render() {
  const category = categoryInput.value;
  const query = catalogName(searchInput.value);
  if (comparisons) return renderComparison(category, query);
  if (!catalog) return;
  const matches = catalog[category].filter(entry => catalogName(entry.name).includes(query));
  el('referenceCount').textContent = `共 ${matches.length} 项`;
  output.classList.toggle('reference-entries', category !== 'lineups');
  output.innerHTML = matches.slice(0, shown).map(entry => category === 'lineups' ? lineupCard(entry, catalog) : entryCard(entry, category, catalog)).join('') ||
    '<p class="fine">暂无符合条件的资料。</p>';
  showMore.hidden = shown >= matches.length;
}

function supports(source, meta) {
  return meta.version === source.version && meta.set === source.season;
}

async function readCatalog(source, meta) {
  const core = source.catalogFile ? [source.catalogFile] : [meta.dataFile, meta.itemsFile, meta.augFile];
  const paths = [...core, source.file, ...(source.ratingsFile ? [source.ratingsFile] : [])];
  const bundle = await loadCatalogBundle(paths, { live: true, optional: [source.ratingsFile] });
  const [rawRoster, itemData = rawRoster, augmentData = rawRoster] = bundle.values.slice(0, core.length);
  const [boardData, ratings] = bundle.values.slice(core.length);
  const selectedScope = { sourceId: source.id, game: source.game, season: meta.set, version: meta.version };
  const roster = { ...rawRoster, set: meta.set, scope: selectedScope };
  const board = adaptBoard(boardData, { source: source.id, setData: roster, items: itemData, ratings });
  const items = [...new Map([...itemData.components, ...itemData.items].map(item => [item.id, item])).values()];
  const lineups = [...board.comps].sort((a, b) => (tierOrder.get(a.rank.tier) ?? tiers.length) - (tierOrder.get(b.rank.tier) ?? tiers.length));
  return { roster, itemData, board, lineups, location: bundle.location, updatedAt: bundle.updatedAt,
    units: roster.units, traits: roster.traits, items, augments: augmentData.augments,
    byUnit: new Map(roster.units.map(unit => [unit.id, unit])),
    byTrait: new Map(roster.traits.map(trait => [trait.id, trait])), byItem: new Map(items.map(item => [item.id, item])) };
}

async function load() {
  const request = ++releaseId;
  const compare = sourceInput.value === 'compare';
  const source = sourceFor(sourceInput.value);
  const meta = findSet(versionInput.value);
  const gold = sourceInput.value === 'dataj';
  const status = el('referenceSource');
  const upload = el('postgameImage');
  const panel = el('postgameReview');
  const lineupFields = el('postgameLineupFields');
  const iconTools = el('postgameIcons');
  const iconFields = iconTools.querySelector('fieldset');
  catalog = null;
  comparisons = null;
  shown = PAGE_SIZE;
  postgame?.reset(gold);
  panel.hidden = !gold;
  upload.disabled = true;
  lineupFields.disabled = true;
  iconFields.disabled = true;
  el('referenceTitle').textContent = compare ? '云顶与金铲铲数据对照' : '版本资料';
  el('comparisonFilter').hidden = true;
  el('comparisonHelp').hidden = !compare;
  matchInput.value = 'all';
  output.classList.remove('comparison-grid', 'reference-entries');
  output.replaceChildren();
  el('referenceCount').textContent = '';
  showMore.hidden = true;
  scope = { sourceId: source.id, game: source.game, season: meta.set, version: meta.version };
  if (compare) {
    status.textContent = `${meta.version} · 读取两端资料中…`;
    const columns = await Promise.all(BOARD_SOURCES.map(async candidate => {
      if (!supports(candidate, meta)) return { source: candidate, message: '此版本暂无数据' };
      try {
        return { source: candidate, data: await readCatalog(candidate, meta) };
      } catch {
        return { source: candidate, message: '数据读取失败', failed: true };
      }
    }));
    if (request !== releaseId) return;
    comparisons = columns;
    status.textContent = `${meta.version} · ${meta.label}`;
    if (columns.some(column => column.failed)) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = '重试加载';
      retry.onclick = () => void load();
      status.append('　', retry);
    }
    render();
    return;
  }
  const enableReview = async () => {
    if (!gold) return;
    try {
      if (!postgame) {
        const { bindPostgameReview } = await import('./ui/postgame-review.js?v=postgame-icons');
        if (request !== releaseId) return;
        postgame = bindPostgameReview({ panel, input: upload, clear: el('clearPostgame'), status: el('postgameStatus'),
          output: el('postgameResult'), lineupForm: el('postgameLineup'), iconTools, getContext: () => sourceInput.value === 'dataj' && !upload.disabled ? {
            setData: catalog?.roster || { scope },
            items: catalog?.itemData, comps: catalog?.lineups,
          } : null });
      }
      if (request === releaseId) {
        upload.disabled = false;
        lineupFields.disabled = !catalog?.roster.units.length;
        iconFields.disabled = lineupFields.disabled;
      }
    } catch {
      if (request === releaseId) el('postgameStatus').textContent = '截图组件加载失败，请刷新页面。';
    }
  };

  if (!supports(source, meta)) {
    status.textContent = `${source.game} ${meta.version} 暂无可用数据。`;
    void enableReview();
    return;
  }
  status.textContent = `${source.game} ${meta.version} 加载中…`;
  try {
    const data = await readCatalog(source, meta);
    if (request !== releaseId) return;
    catalog = data;
    render();
    status.innerHTML = sourceDetails(data, source);
  } catch {
    if (request !== releaseId) return;
    status.textContent = `${source.game} ${meta.version} 数据读取失败。`;
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = '重试加载';
    retry.onclick = () => void load();
    output.replaceChildren(retry);
  }
  void enableReview();
}

sourceInput.onchange = () => { preference('tft-board-source', sourceInput.value); void load(); };
versionInput.onchange = () => { preference('tft-board-release', versionInput.value); void load(); };
categoryInput.onchange = matchInput.onchange = searchInput.oninput = () => { shown = PAGE_SIZE; render(); };
showMore.onclick = () => { shown += PAGE_SIZE; render(); };
void load();
