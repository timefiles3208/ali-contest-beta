import { BOARD_SOURCES, adaptBoard, boardStat, sourceFor } from './adapters/board-sources.js?v=live-catalog';
import { loadCatalogBundle } from './adapters/catalog.js?v=bounded-fallback';
import { SETS, findSet } from './data/sets.js?v=game-release-scope';
import { augmentTier, AUGMENT_TIER_LABELS } from './data/augment-tiers.js';
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
const output = el('referenceResults');
const showMore = el('showMore');
sourceInput.replaceChildren(...BOARD_SOURCES.map(({ id, game }) => new Option(game, id)));
sourceInput.value = sourceFor(preference('tft-board-source')).id;
versionInput.replaceChildren(...SETS.map(meta => new Option(`${meta.version} · ${meta.label}`, meta.version)));
versionInput.value = findSet(preference('tft-board-release'))?.version || SETS[0].version;

function image(entry, size = 28) {
  const sprite = entry.sprite;
  const version = catalog.roster.source?.ddragonVersion;
  const validSprite = sprite && /^\d+\.\d+\.\d+$/.test(version) && /^[\w-]+\.png$/.test(sprite.file) &&
    Number.isInteger(sprite.x) && Number.isInteger(sprite.y);
  return entry.icon || validSprite ? iconHtml({ icon: entry.icon, sprite: validSprite ? sprite : null }, version, size) : '';
}

function lineupCard(comp) {
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
        return `<li>${image(unit)}<div>${h(unit.name)}${comp.stars[id] ? ` · ${comp.stars[id]} 星` : ''}${gear.length ? `<small>${h(gear.join('、'))}</small>` : ''}</div></li>`;
      }).join('')}</ul>
      ${comp.teamCode ? `<label class="reference-code">阵容码 <input readonly value="${h(comp.teamCode)}" /></label>` : ''}
    </div>
  </details>`;
}

function entryCard(entry, category) {
  const { board, byItem, byTrait } = catalog;
  const notes = {
    units: () => [`${entry.cost} 费`, ...(entry.traits || []).map(trait => byTrait.get(trait)?.name)],
    traits: () => (entry.tiers || []).map(tier => `${tier.min} 人`),
    items: () => [boardStat(board.items, entry.name), (entry.from || []).map(id => byItem.get(id)?.name).filter(Boolean).join(' + ')],
    augments: () => [AUGMENT_TIER_LABELS[augmentTier(entry.id)], boardStat(board.augments, entry.name)],
  }[category]().filter(Boolean);
  return `<article class="reference-card"><div class="reference-card-title">${image(entry, 32)}<strong>${h(entry.name)}</strong></div>
    ${notes.length ? `<p class="fine">${h(notes.join(' · '))}</p>` : ''}
    ${entry.desc ? `<p>${h(entry.desc)}</p>` : ''}</article>`;
}

function render() {
  if (!catalog) return;
  const category = categoryInput.value;
  const query = searchInput.value.trim().normalize('NFKC').toLowerCase();
  const matches = catalog[category].filter(entry => entry.name.normalize('NFKC').toLowerCase().includes(query));
  el('referenceCount').textContent = `共 ${matches.length} 项`;
  output.classList.toggle('reference-entries', category !== 'lineups');
  output.innerHTML = matches.slice(0, shown).map(entry => category === 'lineups' ? lineupCard(entry) : entryCard(entry, category)).join('') ||
    '<p class="fine">暂无符合条件的资料。</p>';
  showMore.hidden = shown >= matches.length;
}

async function load() {
  const request = ++releaseId;
  const source = sourceFor(sourceInput.value);
  const meta = findSet(versionInput.value);
  const gold = source.id === 'dataj';
  const status = el('referenceSource');
  const upload = el('postgameImage');
  const panel = el('postgameReview');
  const lineupFields = el('postgameLineupFields');
  catalog = null;
  shown = PAGE_SIZE;
  postgame?.reset(gold);
  panel.hidden = !gold;
  upload.disabled = true;
  lineupFields.disabled = true;
  output.replaceChildren();
  el('referenceCount').textContent = '';
  showMore.hidden = true;
  scope = { sourceId: source.id, game: source.game, season: meta.set, version: meta.version };
  const enableReview = async () => {
    if (!gold) return;
    try {
      if (!postgame) {
        const { bindPostgameReview } = await import('./ui/postgame-review.js?v=lineup-import');
        if (request !== releaseId) return;
        postgame = bindPostgameReview({ panel, input: upload, clear: el('clearPostgame'), status: el('postgameStatus'),
          output: el('postgameResult'), lineupForm: el('postgameLineup'), getContext: () => sourceInput.value === 'dataj' && !upload.disabled ? {
            setData: catalog?.roster || { scope },
            items: catalog?.itemData, comps: catalog?.lineups,
          } : null });
      }
      if (request === releaseId) {
        upload.disabled = false;
        lineupFields.disabled = !catalog?.roster.units.length;
      }
    } catch {
      if (request === releaseId) el('postgameStatus').textContent = '截图组件加载失败，请刷新页面。';
    }
  };

  if (meta.version !== source.version || meta.set !== source.season) {
    status.textContent = `${source.game} ${meta.version} 暂无可用数据。`;
    void enableReview();
    return;
  }
  status.textContent = `${source.game} ${meta.version} 加载中…`;
  const core = source.catalogFile ? [source.catalogFile] : [meta.dataFile, meta.itemsFile, meta.augFile];
  const paths = [...core, source.file, ...(source.ratingsFile ? [source.ratingsFile] : [])];
  try {
    const bundle = await loadCatalogBundle(paths, { live: true, optional: [source.ratingsFile] });
    if (request !== releaseId) return;
    const [rawRoster, itemData = rawRoster, augmentData = rawRoster] = bundle.values.slice(0, core.length);
    const [boardData, ratings] = bundle.values.slice(core.length);
    const roster = { ...rawRoster, set: meta.set, scope };
    const board = adaptBoard(boardData, { source: source.id, setData: roster, items: itemData, ratings });
    const items = [...new Map([...itemData.components, ...itemData.items].map(item => [item.id, item])).values()];
    const lineups = [...board.comps].sort((a, b) => (tierOrder.get(a.rank.tier) ?? tiers.length) - (tierOrder.get(b.rank.tier) ?? tiers.length));
    catalog = { roster, itemData, board, lineups,
      units: roster.units, traits: roster.traits, items, augments: augmentData.augments,
      byUnit: new Map(roster.units.map(unit => [unit.id, unit])),
      byTrait: new Map(roster.traits.map(trait => [trait.id, trait])), byItem: new Map(items.map(item => [item.id, item])) };
    render();
    const date = new Date(bundle.updatedAt || board.extractedAt);
    const updated = Number.isFinite(date.getTime()) ? ` · ${time.format(date)}` : '';
    status.innerHTML = `<a href="https://${h(source.host)}/" target="_blank" rel="noopener noreferrer">${h(source.host)}</a> · ${h(meta.version)} · ${h(locations[bundle.location])}${h(updated)}`;
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
categoryInput.onchange = searchInput.oninput = () => { shown = PAGE_SIZE; render(); };
showMore.onclick = () => { shown += PAGE_SIZE; render(); };
void load();
