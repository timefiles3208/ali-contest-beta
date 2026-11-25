import { formationRoles, recommendedLineups, renderLineupList } from './ui/lineup-list.js?v=formation-plan';
import { openingModel } from './data/s18.18.7.opening-model.js';
import { SETS, findSet } from './data/sets.js';
import { iconHtml } from './ui/helpers.js';
import { loadCatalogBundle } from './adapters/catalog.js?v=catalog-alignment';
import { bindModelReference } from './ui/model-reference.js?v=screenshot-ocr';
import { bindScreenReader } from './ui/screen-reader.js?v=ocr-priority';
import { bindOpponentScout } from './ui/opponent-scout.js?v=ocr-priority';
import { bindOpeningAdvice } from './ui/opening-advice.js?v=formation-plan';
import { bindMatchSamples } from './ui/match-samples.js?v=match-variants';
import { bindIconMatch } from './ui/icon-match.js?v=ocr-scale';
import { OPENING_EFFECTS, S18_OPENINGS } from './data/opening-encounters.js?v=city-augments';
import { AUGMENT_TIER_LABELS, augmentTier } from './data/augment-tiers.js';
import { rankOpening } from './engine/opening.js?v=formation-plan';
import { recommend, traitBreakdown } from './engine/recommend.js';
import { traitPaths } from './engine/paths.js';
import { rankAugments, CATEGORY_LABEL } from './engine/augments.js?v=formation-plan';
import { planItems } from './engine/items.js';
import { buildCompGuide, filterCompPlans } from './engine/comp-guide.js?v=formation-plan';
import { validateComps } from './adapters/provider.js';
import { BOARD_SOURCES, adaptBoard, boardStat, sourceFor, summarizeBoard } from './adapters/board-sources.js?v=planning-tools';
import { recognizeSnapshot, matchSnapshot, autoSelect, imageKind, looksLikeImage, importImageUrl, MAX_SOURCE_BYTES } from './adapters/snapshot.js?v=ocr-priority';

const el = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let modelReference, screenReader, openingAdvice, matchSamples, iconMatch, scout;
let boardLoad = 0;
let setLoad = 0;
let loadingSet = false;
const SOURCE_KEY = 'tft-board-source';
const catalogLocation = location => location === 'database' ? 'Supabase' : '本地快照';
function savedSource() {
  try { return sourceFor(localStorage.getItem(SOURCE_KEY)).id; } catch { return BOARD_SOURCES[0].id; }
}

const state = {
  meta: null,
  setData: null,
  comps: [],
  issues: [],
  sourceId: savedSource(),
  board: null,
  selected: new Set(),
  level: 7,
  cost: null,
  query: '',
  open: new Set(),
  items: null,
  augs: null,
  ref: null,
  owned: new Map(),
  ownedItems: new Set(),
  chosen: new Set(),
  openingCity: '',
  economy: '',
  openingAugment: '',
  opponentBoards: new Map(),
  snap: { file: null, thumb: '', busy: false, importing: false, rotation: 0, error: null, mapped: null, applied: false },
};

async function loadBoard() {
  state.opponentBoards.clear();
  scout?.reset();
  screenReader?.reset();
  openingAdvice?.reset();
  el('augmentTierFilter').value = '';
  state.openingCity = state.economy = '';
  const generation = ++boardLoad;
  const source = sourceFor(state.sourceId);
  const badge = el('sourceBadge');
  state.comps = [];
  state.open.clear();
  state.board = null;
  state.ref = null;
  state.issues = [];
  badge.className = 'badge';
  badge.textContent = `${source.host} · 读取中…`;
  if (loadingSet || !state.setData) return;
  state.issues = ['正在读取所选榜单…'];
  renderResults();
  try {
    if (state.setData.set !== 18) throw new Error('此赛季没有该数据源的快照');
    const paths = source.ratingsFile ? [source.file, source.ratingsFile] : [source.file];
    const { values: [raw, ratings = null], location } = await loadCatalogBundle(paths, { optional: [source.ratingsFile] });
    if (generation !== boardLoad) return;
    const board = adaptBoard(raw, { source: source.id, setData: state.setData, items: state.items, ratings });
    const valid = validateComps(board.comps, state.setData);
    state.board = board;
    state.comps = valid.comps;
    state.ref = summarizeBoard(valid.comps);
    state.issues = valid.issues;
    badge.textContent = `${source.host} · ${board.version} · ${state.comps.length} 套 · ${catalogLocation(location)}`;
    badge.className = `badge ${state.comps.length ? 'ok' : 'warn'}`;
  } catch (error) {
    if (generation !== boardLoad) return;
    state.issues = [`${source.host}：${error.message}`];
    badge.textContent = `${source.host} · 数据不可用`;
    badge.className = 'badge warn';
  }
  renderResults();
}

async function loadSet(setNum) {
  state.opponentBoards.clear();
  scout?.reset();
  screenReader?.reset();
  iconMatch?.reset();
  const meta = findSet(setNum);
  const generation = ++setLoad;
  boardLoad++;
  loadingSet = true;
  state.meta = meta;
  modelReference?.setScope(state.sourceId, null, sourceFor(state.sourceId).game);
  state.selected.clear();
  state.open.clear();
  state.cost = null;
  state.query = '';
  state.owned.clear();
  state.ownedItems.clear();
  state.chosen.clear();
  state.openingAugment = '';
  state.snap.mapped = null;
  state.snap.applied = false;
  state.snap.error = null;
  el('search').value = '';

  const catalogBadge = el('catalogBadge');
  catalogBadge.className = 'badge';
  catalogBadge.textContent = '卡池载入中…';
  const release = await loadCatalogBundle([meta.dataFile, meta.itemsFile, meta.augFile], {
    optional: [meta.itemsFile, meta.augFile],
  }).catch(error => ({ values: [{ set: meta.set, costs: [], traits: [], units: [], source: {}, loadError: error.message }, null, null] }));
  const [setData, items, augments] = release.values;
  if (generation !== setLoad) return;
  loadingSet = false;
  const coreReady = setData.units.length > 0;
  const complete = coreReady && items && augments;
  catalogBadge.className = `badge ${complete ? 'ok' : 'warn'}`;
  catalogBadge.textContent = coreReady
    ? `卡池·装备·海克斯 · ${catalogLocation(release.location)}${complete ? '' : ' · 部分缺失'}`
    : meta.status === 'preview' ? '卡池 · 赛季预览' : '卡池 · 数据不可用';
  state.setData = setData;
  state.items = items;
  state.augs = augments;
  el('planCap').value = '';
  el('planTrait').replaceChildren(new Option('全部羁绊', ''),
    ...(setData.traits || []).map(({ name, id }) => new Option(name, id)));
  refreshPlanTiers();
  el('modelUnit').replaceChildren(new Option('选择棋子', ''), ...setData.units.map(({ id, name }) => {
    const option = new Option(name, name);
    option.dataset.unitId = id;
    return option;
  }));
  modelReference?.setScope(state.sourceId, setData.units.length ? setData.set : null, sourceFor(state.sourceId).game);

  renderCostTabs();
  renderUnits();
  void loadBoard();
  renderSnapshot();
}

function renderCostTabs() {
  const costs = state.setData.costs || [];
  el('costTabs').innerHTML = `<button class="${state.cost === null ? 'on' : ''}" data-cost="">全部<em class="n">${state.setData.units.length}</em></button>` +
    costs.map((c) => `<button class="${state.cost === c ? 'on' : ''}" data-cost="${c}">${c} 费<em class="n">${state.setData.units.filter((u) => u.cost === c).length}</em></button>`).join('');
}

function matches(unit) {
  if (state.cost !== null && unit.cost !== state.cost) return false;
  if (!state.query) return true;
  const q = state.query.toLowerCase();
  return unit.name.toLowerCase().includes(q) || (unit.traits || []).some((t) => traitName(t).toLowerCase().includes(q)) || unit.id.toLowerCase().includes(q);
}

function traitName(id) {
  const t = (state.setData.traits || []).find((x) => x.id === id);
  return t ? t.name : id;
}

function renderUnits() {
  const version = state.setData.source?.ddragonVersion;
  if (!state.setData.units.length) {
    el('unitGrid').innerHTML = `<div class="empty">${esc(state.meta.label)}：卡池数据尚未落地<br />
      ${esc(state.setData.preview?.schedule || state.meta.window || '')}<br />
      上线后跑 <code>node scripts/build-set-data.mjs --set ${state.meta.set}</code> 生成卡池再刷新。</div>`;
    renderSelected();
    return;
  }
  el('unitGrid').innerHTML = state.setData.units.filter(matches).map((u) => {
    const on = state.selected.has(u.id);
    const tr = (u.traits || []).map(traitName).slice(0, 3).join(' ');
    return `<button class="unit ${on ? 'on' : ''}" data-id="${u.id}" title="${esc(u.id)}">
      <span class="cost c${u.cost}">${u.cost}</span>
      ${iconHtml(u, version, 48)}
      <span class="nm">${esc(u.name)}</span>
      <span class="tr">${esc(tr)}</span>
    </button>`;
  }).join('');
  renderSelected();
}

function renderSelected() {
  const version = state.setData.source?.ddragonVersion;
  const list = [...state.selected].map((id) => state.setData.units.find((u) => u.id === id)).filter(Boolean);
  el('selectedList').innerHTML = list.length
    ? list.map((u) => `<button class="unit on mini" data-id="${u.id}" title="点击移除">${iconHtml(u, version, 34)}<span class="nm">${esc(u.name)}</span></button>`).join('')
    : '<span class="hint">还没选</span>';
  el('selCount').textContent = `${list.length} 选 / 人口 ${state.level}`;
}

function renderCompGuide(comp) {
  const { board, units, rolls, transition, transitionStages, adaptiveTransitions } = buildCompGuide(
    comp, state.setData, state.board?.version,
    { selected: state.selected, owned: state.owned, ownedItems: state.ownedItems, itemsData: state.items },
  );
  const version = state.setData.source?.ddragonVersion;
  const items = new Map([...(state.items?.items || []), ...(state.items?.components || [])].map(item => [item.id, item.name]));
  const rows = board.map((row, i) => `<div class="guide-rank" aria-label="第 ${i + 1} 排">
    ${row.map(unit => unit
      ? `<span class="guide-cell occupied" title="${esc(unit.name)} · ${unit.stars} 星">${iconHtml(unit, version, 26)}<span>${esc(unit.name)}</span></span>`
      : '<span class="guide-cell" aria-hidden="true"></span>').join('')}
  </div>`).join('');
  const targets = units.map(unit => `<tr>
    <th scope="row">${esc(unit.name)} <small>${unit.cost}费</small></th>
    <td><span class="guide-stars">${unit.stars} 星</span><small>${unit.sourceStars ? '来源标注' : '参考'}</small></td>
    <td>${unit.items.map(id => items.get(id)).filter(Boolean).map(esc).join('、') || '—'}</td>
  </tr>`).join('');
  const levels = rolls.map(({ level, targets }) =>
    `<li><strong>${level} 级</strong> · ${targets.map(unit => `${unit.stars >= 3 ? '追' : unit.cost >= 4 ? '搜' : '顺手补'} ${esc(unit.name)} ${unit.cost}费 ${unit.stars}星${unit.sourceStars ? '' : '参考'}`).join('、')}</li>`).join('');
  const riftbeastShop = comp.aimTraits?.DA_Riftbeast18 >= 5
    && rolls.some(({ targets }) => targets.some(unit => unit.traits?.includes('DA_Riftbeast18')));
  const traitLine = (traits) => traits.map(trait => `${trait.tier} ${esc(trait.name)}`).join(' · ');
  const source = transitionStages[0]?.source;
  const transitionBoards = transitionStages.map(stage => `<li>
    <strong>${stage.level} 人口</strong>
    <div class="guide-transition-units">
      ${stage.units.map(unit => `<span>${iconHtml(unit, version, 22)}${esc(unit.name)}</span>`).join('')}
    </div>
    <p class="fine">${traitLine(stage.traits) || '暂无激活羁绊'}</p>
  </li>`).join('');
  const adaptiveBoards = adaptiveTransitions.map(stage => `<li>
    <strong>${stage.level} 人口</strong> <span class="fine">已持有 ${stage.held.length}/${stage.level}</span>
    <div class="guide-transition-units">
      ${stage.units.map(unit => `<span data-held="${stage.held.includes(unit.id)}">${iconHtml(unit, version, 22)}${esc(unit.name)}</span>`).join('')}
    </div>
    <p class="fine">${traitLine(stage.traits) || '暂无激活羁绊'}</p>
    ${stage.units.length < stage.level ? `<p class="fine">还有 ${stage.level - stage.units.length} 个位置可补</p>` : ''}
    ${stage.gear.length ? `<ul class="transition-gear">
      ${stage.gear.map(row => `<li>${esc(row.item.name)} → ${esc(row.unit.name)} · ${row.state === 'done' ? '已持有' : row.state === 'ready' ? '散件可合成' : `还缺 ${esc(items.get(row.missing) || '1 件散件')}`}${row.target.id !== row.unit.id ? ` · 可过渡给 ${esc(row.target.name)}` : ''}</li>`).join('')}
    </ul>` : ''}
  </li>`).join('');
  return `<section class="comp-guide" aria-label="阵容攻略">
    <section class="guide-transition">
      <h3>过渡阵容</h3>
      ${adaptiveBoards ? `
        <h4>按当前来牌和装备调整</h4>
        <ul class="guide-transition-stages adaptive-transition-stages">${adaptiveBoards}</ul>
        <h4>原始参考</h4>
      ` : ''}

      ${source ? `
        <p class="fine">攻略推演 · <a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.name)} ${esc(source.patch)}</a></p>
        <ul class="guide-transition-stages">${transitionBoards}</ul>
      ` : `
        <p class="fine">低费棋子推演</p>
        <p>${transition.units.map(unit => esc(unit.name)).join('、') || '可先用已成型的低费羁绊过渡。'}</p>
        ${transition.traits.length ? `<p class="fine">${traitLine(transition.traits)}</p>` : ''}
      `}
    </section>
    <div class="guide-layout">
      <div class="guide-position">
        <h3>参考站位</h3>
        <p class="fine">上方为前排，按羁绊和装备推演。</p>
        <div class="guide-board">${rows}</div>
      </div>
      <div class="guide-roll">
        <h3>推荐搜牌等级</h3>
        <p class="fine">按核心棋子的费用和目标星级估算，最终阵容人口单独列出。</p>
        ${levels ? `<ul>${levels}</ul>` : '<p class="fine">缺少可用于估算的棋子费用。</p>'}
        ${riftbeastShop ? '<p class="fine">开启 5 峡谷野怪时，也可利用羁绊商店补牌。</p>' : ''}
      </div>
    </div>
    <table class="guide-targets">
      <thead><tr><th scope="col">棋子</th><th scope="col">目标星级</th><th scope="col">推荐装备</th></tr></thead>
      <tbody>${targets}</tbody>
    </table>
    ${comp.teamCode ? '<button type="button" class="ghost" data-copy-team>复制云顶阵容码</button><p class="fine copy-status" role="status"></p>' : ''}
  </section>`;
}

function refreshPlanTiers() {
  const trait = state.setData?.traits.find(row => row.id === el('planTrait').value);
  const tier = el('planTier');
  tier.replaceChildren(new Option('任意已激活', ''),
    ...(trait?.tiers || []).map(({ min }) => new Option(`${min} 人档及以上`, min)));
  tier.disabled = !trait;
}

function openingContext() {
  if (!state.setData) return null;
  const cities = state.sourceId === 'datatft' && state.setData.set === 18 ? S18_OPENINGS : OPENING_EFFECTS;
  const augments = state.augs?.augments || [];
  return {
    ...state, itemsData: state.items, cities, augments, ranked: state.ranked || [],
    city: cities.find(row => row.id === state.openingCity),
    chosenAugments: augments.filter(row => state.chosen.has(row.id)),
  };
}

function renderResults() {
  const sel = state.selected;
  const box = el('comps');
  const bd = traitBreakdown(state.setData, sel);
  el('traitsNow').innerHTML = sel.size
    ? bd.filter((t) => t.tier > 0).map((t) => `<span class="tchip ${t.tier >= 5 ? 'hi' : ''}">${esc(t.name)} <b>${t.tier}</b><em style="opacity:.55;font-style:normal">${t.num}人</em></span>`).join('') ||
      '<span class="tchip">所选棋子还没有凑出可激活羁绊</span>'
    : '';
  renderFoot();
  state.ranked = null;

  if (!state.setData.units.length) {
    box.innerHTML = `<div class="empty">${esc(state.meta.label)} 的卡池尚未生成，推荐不可用。<br />${esc(state.setData.preview?.note || '')}</div>`;
    renderSide();
    return;
  }
  if (!state.comps.length) {
    box.innerHTML = `<div class="empty">${esc(state.issues.join('；') || '阵容库为空')}</div>`;
    renderSide();
    return;
  }
  const ranked = rankOpening({ ...openingContext(), patch: state.board?.version, model: openingModel });
  state.ranked = ranked;
  const filters = { trait: el('planTrait').value, tier: Number(el('planTier').value), maxLevel: Number(el('planCap').value) };
  const exploring = Boolean(filters.trait || filters.maxLevel);
  const matched = ranked.filter(row => row.viable);
  const plans = exploring ? filterCompPlans(ranked, filters)
    : matched.length < 3 ? recommendedLineups(ranked) : matched;
  const hot = plans.slice(0, 8);
  const coldCount = ranked.length - matched.length - hot.filter(row => !row.viable).length;
  if (!hot.length) {
    box.innerHTML = exploring
      ? '<div class="empty">没有符合筛选条件的阵容。</div>'
      : '<div class="empty">确认城邦、现有棋子或装备后查看阵容排序。</div>';
    renderSide();
    return;
  }
  const coldNote = exploring ? `<p class="fine">符合条件 ${plans.length} 套，显示前 ${hot.length} 套。</p>` : coldCount
    ? `<p class="fine" style="margin:10px 2px 0;color:#5f7284;font-size:12px">另有 ${coldCount} 套暂未匹配开局条件。</p>`
    : '';
  box.innerHTML =
    hot.map((r, i) => {
    const c = r.comp;
    const coreMissing = r.detail.coreMissing;
    const tags = [formationRoles(r.formation), c.level ? `最终阵容 ${c.level} 人口` : null, c.diff ? `难度 ${c.diff}` : null]
      .filter(Boolean).map(esc).join('<span>·</span>');
    const body = state.open.has(c.id) ? `<div class="rows">
      ${r.reasons.length ? `<div class="row"><span class="k">开局契合</span><span class="v">${esc(r.reasons.join(' · '))}</span></div>` : ''}
      ${r.detail.coreHit.length ? `<div class="row"><span class="k">已命中核心</span><span class="v">${r.detail.coreHit.map((n) => `<span class="tchip">${esc(n)}</span>`).join('')}</span></div>` : ''}
      ${coreMissing.length ? `<div class="row"><span class="k">核心缺口</span><span class="v warnline">${coreMissing.map(esc).join('、')}</span></div>` : ''}
      ${renderCompGuide(c)}
      ${(() => { const act = r.simulatedTraits.filter((t) => t.tier > 0); return act.length ? `<div class="row"><span class="k">当前羁绊</span><span class="v">${act.map((t) => `<span class="tchip ${t.aim && t.tier >= t.aim ? 'hi' : ''}">${esc(t.name)} <b>${t.tier}</b>${t.aim ? `<em style="opacity:.55;font-style:normal">/目标 ${t.aim}</em>` : ''}<em style="opacity:.55;font-style:normal">${t.num}人</em></span>`).join('')}</span></div>` : ''; })()}
      ${r.detail.missing.filter(Boolean).length ? `<div class="row"><span class="k">还需要</span><span class="v">${r.detail.missing.map((u) => `<span class="tchip">${esc(u.name)} <b>${u.cost}费</b></span>`).join('')}</span></div>` : ''}
      ${r.detail.ownedOutside.length ? `<div class="row"><span class="k">你还有</span><span class="v"><span class="note">${esc(r.detail.ownedOutside.join('、'))} 不在这套里，可作为转型筹码</span></span></div>` : ''}
      ${r.detail.levelGap ? `<div class="row"><span class="k">人口</span><span class="v warnline">距离最终阵容人口还有 ${r.detail.levelGap} 级</span></div>` : ''}
      ${c.econ ? `<div class="row"><span class="k">运营</span><span class="v"><span class="note">${esc(c.econ)}</span></span></div>` : ''}
      ${c.rank ? `<div class="row"><span class="k">榜单</span><span class="v"><span class="note">${esc([
        c.rank.source, c.rank.tier && `评级 ${c.rank.tier}`, c.rank.appear != null && `出场 ${c.rank.appear}`,
        c.rank.top4 != null && `前四 ${c.rank.top4}%`, c.rank.first != null && `登顶 ${c.rank.first}%`,
        c.rank.avg != null && `均位 ${c.rank.avg}`, c.rank.samples != null && `样本 ${c.rank.samples}`,
      ].filter(Boolean).join(' · '))}</span></span></div>` : ''}
      ${c.notes ? `<div class="row"><span class="k">说明</span><span class="v"><span class="note">${esc(c.notes)}</span></span></div>` : ''}
      ${!r.viable ? '<div class="row"><span class="k">判定</span><span class="v warnline">当前开局条件未匹配，可作为赛前参考。</span></div>' : ''}
    </div>` : '';
    return `<article class="comp ${state.open.has(c.id) ? 'open' : ''} ${r.viable ? '' : 'cold'}" data-comp="${c.id}">
      <header class="comp-head"><span class="rank">${i + 1}</span><span class="nm">${esc(c.name)}${c.rank?.tier ? ` <small class="board-stat">${esc(c.rank.tier)} 级</small>` : ''}</span>
        <span class="tags">${tags}</span>
        <span class="score"><span class="meter"><i style="width:${Math.min(100, r.score)}%"></i></span><span class="num c${r.score >= 70 ? 2 : r.score >= 40 ? 4 : 1}">${r.score}</span></span>
      </header>${body}
    </article>`;
  }).join('') + coldNote;
  renderSide();
}

// 三个附加面板都跟着「当前最成型的那套」走，所以统一从这里出口。
function renderSide() {
  renderCompStrip();
  const top = (state.ranked || []).find((r) => r.viable) || null;
  renderPaths(top);
  renderHexes(top);
  renderGear(top);
  renderSnapshotLineups();
  openingAdvice?.draw();
  scout?.render();
  if (state.ranked) screenReader?.refreshDirection();
  matchSamples?.refresh();
}

function renderCompStrip() {
  const box = el('compGrid');
  if (!state.items) {
    box.innerHTML = `<div class="empty">本赛季装备数据未生成${state.meta.status === 'preview' ? '（等正式服数据落地）' : ''}。</div>`;
    el('compCount').textContent = '';
    return;
  }
  const version = state.setData.source?.ddragonVersion;
  box.innerHTML = state.items.components
    .map((c) => {
      const n = state.owned.get(c.id) || 0;
      return `<button class="ic ${n ? 'on' : ''}" data-comp="${c.id}" title="${esc(c.name)}">
        ${iconHtml(c, version, 40)}<span class="nm">${esc(c.name)}</span><em class="cnt">${n}</em></button>`;
    })
    .join('');
  const total = [...state.owned.values()].reduce((a, b) => a + b, 0);
  el('compCount').textContent = `${total} 件散件${state.ownedItems.size ? ` / ${state.ownedItems.size} 件已做` : ''}`;
}

function renderPaths(top) {
  const box = el('paths');
  if (!state.setData.units.length || !state.selected.size) {
    box.innerHTML = '<div class="empty">先勾棋子，这里才给得出「下一步抓谁」。</div>';
    return;
  }
  const version = state.setData.source?.ddragonVersion;
  const rows = traitPaths({
    setData: state.setData,
    selected: state.selected,
    aimTraits: top?.comp.aimTraits || {},
    compUnits: top?.comp.units || [],
    traitRanks: state.ref?.traits || [],
  });
  box.innerHTML = rows
    .map((r) => {
      const to = r.capped ? (r.tier ? '已满层，补质量就好' : '卡池里没可抓的人了') : `再 ${r.peopleNeeded} 人 → ${r.nextMin} 人档`;
      return `<div class="path ${r.aim ? 'aim' : ''}">
        <span class="pn">${esc(r.name)}</span><b class="ptier">${r.tier}</b><span class="pnow">${r.num} 人</span>
        <span class="pto">${esc(to)}${r.aim && r.num < r.aim ? ` · 目标 ${r.aim}` : ''}${r.board ? ` · 榜单 ${r.board.boards} 套 / ${r.board.avgTop4}% 前四` : ''}</span>
        <span class="pcand">${r.candidates
          .map((u) => `<button class="unit mini cand" data-id="${u.id}" title="点一下加入选择">${iconHtml(u, version, 30)}<span class="nm">${esc(u.name)}</span><i class="c${u.cost}">${u.cost}费</i></button>`)
          .join('') || '<em class="hint">无可补</em>'}</span>
      </div>`;
    })
    .join('');
}

function renderHexes(top) {
  const box = el('hexes');
  if (!state.augs) {
    box.innerHTML = '<div class="empty">本赛季海克斯数据未生成，跑 <code>node scripts/build-set-data.mjs</code> 后会出现在这里。</div>';
    return;
  }
  const byId = new Map(state.augs.augments.map((a) => [a.id, a]));
  const tier = el('augmentTierFilter').value;
  const inTier = id => !tier || augmentTier(id) === tier;
  const curatedAll = top?.comp.hexes || [];
  const curatedSet = new Set(curatedAll);
  const curated = curatedAll.filter(id => inTier(id) && !state.chosen.has(id));
  const list = rankAugments({
    setData: state.setData,
    augments: state.augs.augments.filter(aug => inTier(aug.id)),
    ranked: state.ranked || [],
    selected: state.selected,
    chosen: state.chosen,
    city: openingContext()?.city,
    economy: state.economy, itemsData: state.items, owned: state.owned, ownedItems: state.ownedItems,
    limit: 10,
  }).filter((x) => !curatedSet.has(x.aug.id));

  const chip = (a, kind) => {
    const stat = boardStat(state.board?.augments, a.name);
    const color = augmentTier(a.id);
    return `<button class="hex ${kind || ''}" data-hex="${a.id}" title="${esc(a.desc)}"><b>${esc(a.name)}</b>${color ? `<span class="augment-tier" data-tier="${color}">${AUGMENT_TIER_LABELS[color]}</span>` : ''}${stat ? `<small class="board-stat">${esc(stat)}</small>` : ''}${kind === 'lib' ? '<em class="tag">库里推荐</em>' : ''}</button>`;
  };

  const chosenRow = [...state.chosen].map((id) => byId.get(id)).filter(Boolean);
  const head = chosenRow.length
    ? `<div class="hex-row"><span class="hk">已拿</span><span class="hv">${chosenRow.map((a) => chip(a, 'taken')).join('')}</span></div>`
    : '';
  const libRow = curated.length
    ? `<div class="hex-row"><span class="hk">这套推荐</span><span class="hv">${curated.map((id) => byId.get(id)).filter(Boolean).map((a) => chip(a, 'lib')).join('')}</span></div>`
    : '';
  const body = list.length
    ? list
        .map(
          (x) => `<div class="hex-row">
            <span class="hk"><i class="hbar" style="width:${Math.round(x.score * 100)}%"></i></span>
            <span class="hv">${chip(x.aug)}<span class="why">${x.reasons.map(esc).join(' · ')}（${esc(CATEGORY_LABEL[x.category] || '通用')}）</span></span>
          </div>`
        )
        .join('')
    : '<div class="empty">没有可选的海克斯了（都拿过了？）</div>';
  box.innerHTML = head + libRow + body;
}

function renderGear(top) {
  const box = el('gear');
  if (!state.items) {
    box.innerHTML = '<div class="empty">装备数据未生成。</div>';
    return;
  }
  if (!top) {
    box.innerHTML = '<div class="empty">核心件还没摸到，先按手上的散件打过渡，等成型再规划成装。</div>';
    return;
  }
  const version = state.setData.source?.ddragonVersion;
  const plan = planItems({ setData: state.setData, itemsData: state.items, comp: top.comp, owned: state.owned, ownedItems: state.ownedItems });
  if (!plan.rows.length) {
    box.innerHTML = `<div class="empty">库里没给「${esc(top.comp.name)}」标注成装推荐。</div>`;
    return;
  }
  const label = { done: '已做', ready: '可合成', lack: '缺' };
  // 从当前榜单统计该棋子的常见成装。
  const bisOf = new Map((state.ref?.bis || []).map((b) => [b.unitId, new Set(b.items)]));
  box.innerHTML =
    `<p class="fine">目标阵容：${esc(top.comp.name)}（成型分 ${top.score}）· 点成装可标记为已做${state.ref?.bis?.length ? ' · 「榜单」为来源站的常见成装' : ''}</p>` +
    plan.rows
      .map(
        (row) => `<div class="gear-row">
          <span class="gunit">${iconHtml(row.unit, version, 34)}<b>${esc(row.unit.name)}</b><em>${esc(row.role)}</em></span>
          <span class="gitems">${row.recs
            .map((r) => {
              const need = r.need.map((n) => esc(n.name)).join('/');
              const onBoard = bisOf.get(row.unitId)?.has(r.item.id);
              const stat = boardStat(state.board?.items, r.item.name);
              return `<button class="gi ${r.state}" data-item="${r.item.id}" title="${esc(r.item.name)}：${esc(r.from.map((f) => f.name).join(' + '))}${onBoard ? ' · 榜单常见件' : ''}">
                ${iconHtml(r.item, version, 34)}<span class="nm">${esc(r.item.name)}</span><em>${r.state === 'lack' ? `缺 ${need}` : label[r.state]}${stat ? ` · ${esc(stat)}` : onBoard ? ' · 榜单' : ''}</em></button>`;
            })
            .join('')}</span>
        </div>`
      )
      .join('') +
    (plan.spare.length ? `<p class="fine">散件还够顺手做：${plan.spare.map((s) => esc(s.item.name)).join('、')}</p>` : '');
}

function renderFoot() {
  const d = state.setData;
  if (!d.units.length) {
    el('footNote').textContent = `S${d.set} 卡池尚未生成（${d.preview?.schedule || '等待正式服数据落地'}）`;
    return;
  }
  el('footNote').textContent =
    `S${d.set} 卡池 ${d.units.length} 个单位 / 羁绊 ${d.traits.length} 个（来源 Riot DDragon ${d.source?.ddragonVersion}）` +
    (state.board
      ? `；${sourceFor(state.sourceId).host} ${state.board.version} 快照（${state.board.extractedAt} 抓取），已映射 ${state.comps.length} 套${state.board.skipped.length ? `，${state.board.skipped.length} 套含未对应的棋子` : ''}`
      : '') +
    (d.units.some((u) => !u.traits.length) ? '；注意：部分棋子缺少羁绊映射' : '');
}


function unitById(id) {
  return (state.setData?.units || []).find((u) => u.id === id) || null;
}

function snapRow(key) {
  const [kind, i] = String(key).split(':');
  return state.snap.mapped?.[kind]?.[Number(i)] || null;
}

function snapChip(u, key) {
  const version = state.setData.source?.ddragonVersion;
  const unit = u.id ? unitById(u.id) : null;
  if (!state.snap.mapped.matchFrame) {
    return `<span class="unit mini">${unit ? iconHtml(unit, version, 34) : ''}<span class="nm">${esc(u.name)}</span></span>`;
  }
  if (unit) {
    const reviewing = !state.snap.applied && !key.startsWith('shop:');
    const on = reviewing ? !u.excluded : state.selected.has(unit.id);
    return `<button class="unit mini ${on ? 'on' : ''}" data-id="${unit.id}" data-snap="${key}" aria-pressed="${on}" title="点一下${on ? '移出' : '加入'}选择">
      ${iconHtml(unit, version, 34)}<span class="nm">${esc(unit.name)}</span>${u.star > 1 ? `<span class="snap-star">${u.star}★</span>` : ''}</button>`;
  }
  if (u.variants?.length) {
    return u.variants.map((v) => `<button class="unit mini cand" data-id="${v.id}" data-var="${key}" title="${esc(u.name)} 有多个形态，点选这一个">
      ${iconHtml(unitById(v.id), version, 30)}<span class="nm">${esc(v.label || u.name)}</span><i class="c${v.cost}">${v.cost}费</i></button>`).join('');
  }
  return u.name
    ? `<button class="tchip snap-miss" data-miss="${key}" title="卡池里没有这个名字，点一下填进搜索框">${esc(u.name)} ?</button>`
    : '<span class="tchip snap-miss">未确认棋子</span>';
}

function snapshotUnitDetails(unit, isBoard) {
  const pos = isBoard && unit.row && unit.col ? `第 ${unit.row} 排 · 第 ${unit.col} 列` : '';
  return [pos, unit.appearance, unit.items.join('、')].filter(Boolean)
    .map((label) => `<small class="snap-unit-items">${esc(label)}</small>`).join('');
}

function renderSnapshotLineups() {
  const output = el('snapLineup');
  const snap = state.snap;
  if (!snap.ai || !snap.mapped?.matchFrame || !snap.applied) {
    output.hidden = true;
    output.replaceChildren();
    return;
  }
  output.hidden = !renderLineupList(output, state.ranked || [], { link: true });
}
function renderSnapshot() {
  const snap = state.snap;
  const thumb = el('snapThumb');
  el('snapPreview').hidden = !snap.thumb;
  if (snap.thumb) thumb.src = snap.thumb;
  else thumb.removeAttribute('src');
  thumb.style.transform = `rotate(${snap.rotation}deg)`;
  thumb.classList.toggle('sideways', snap.rotation % 180 !== 0);
  const locked = snap.busy || snap.importing;
  el('snapRun').disabled = !snap.file || !state.setData?.units.length || locked;
  el('snapAi').disabled = el('snapRun').disabled;
  el('snapClear').disabled = !snap.file || locked;
  el('snapRotate').disabled = !snap.file || locked;
  el('snapPaste').disabled = locked;
  el('snapUrlLoad').disabled = locked;
  el('snapFile').disabled = locked;

  const status = el('snapStatus');
  if (snap.importing) {
    status.className = 'snap-status wait';
    status.textContent = '正在读取图片…';
  } else if (snap.busy) {
    status.className = 'snap-status wait';
    status.textContent = snap.enhancing ? '正在加载或运行 PaddleOCR，本次识别在浏览器内完成…' : '正在读取截图上的文字…';
  } else if (snap.error) {
    status.className = 'snap-status bad';
    status.textContent = snap.error.message;
  } else if (snap.mapped) {
    status.className = 'snap-status ok';
    status.textContent = !snap.mapped.matchFrame ? '未确认对局画面。以下是文字预览，请在棋子栏手动核对。'
      : snap.applied ? '识别结果已应用。' : snap.mapped.candidates.length
      ? '已读取截图文字，请勾选确认拥有的棋子。'
      : '已读出部分画面信息。棋子名未读到，可在下方手选。';
  } else if (snap.file) {
    status.className = 'snap-status ok';
    status.textContent = '截图已就绪，点「开始识别」。';
  } else {
    status.className = 'snap-status';
    status.textContent = snap.mapped ? '已导入一张截图。' : '未导入截图 — 直接手选棋子也能出完整推荐。';
  }

  if (!locked && snap.mapped && snap.timedOut) status.textContent += ' 已到等待上限，显示当前可用结果。';
  if (!locked && snap.ai === 'fallback' && !snap.timedOut && !snap.error) {
    status.textContent += ' PaddleOCR 未能运行，已使用常规识别。';
  }

  renderSnapshotLineups();
  const box = el('snapResult');
  const m = snap.mapped;
  if (!m) { box.innerHTML = ''; return; }
  const head = [
    snap.ai === 'used' ? 'PaddleOCR 本地增强' : '本地文字识别',
    m.level ? `人口 ${m.level}` : null,
    m.gold != null ? `金币 ${m.gold}` : null,
    m.hp != null ? `血量 ${m.hp}` : null,
    m.stage ? `阶段 ${esc(m.stage)}` : null,
  ].filter(Boolean);
  const row = (label, list, key) =>
    list.length ? `<div class="snap-row"><span class="snap-k">${label} ${list.length}</span><span class="snap-v">${list.map((u, i) => `<span class="snap-unit-result"><span>${snapChip(u, `${key}:${i}`)}</span>${snapshotUnitDetails(u, key === 'board')}</span>`).join('')}</span></div>` : '';
  const traitRow = (label, values, empty) =>
    `<div class="snap-row"><span class="snap-k">${label}</span><span class="snap-v">${values.map((trait) => {
      const stats = [trait.count != null ? `${trait.count} 人` : '', trait.tier ? `${trait.tier} 档` : ''].filter(Boolean);
      return `<span class="tchip ${trait.id ? '' : 'snap-miss'}">${esc(trait.name)}${stats.length ? ` <b>${esc(stats.join(' · '))}</b>` : ''}${trait.id ? '' : '（未匹配）'}</span>`;
    }).join('') || `<span class="fine">${empty}</span>`}</span></div>`;
  const board = m.board.filter((unit) => unit.id && !unit.excluded).map((unit) => unit.id);
  const calculated = traitBreakdown(state.setData, board).filter((trait) => trait.tier > 0)
    .map((trait) => ({ ...trait, count: trait.num }));
  const inventory = (label, list) => list.length
    ? `<div class="snap-row"><span class="snap-k">${label}</span><span class="snap-v">${list
        .map((c) => `<span class="tchip ${c.id ? '' : 'snap-miss'}">${esc(c.name)} <b>${c.count}</b></span>`).join('')}</span></div>`
    : '';
  const need = [];
  const unresolved = [...m.candidates, ...m.board, ...m.bench, ...m.shop].filter((u) => u.variants);
  if (unresolved.length) need.push(`点击对应形态确认：${unresolved.map((u) => esc(u.name)).join('、')}`);
  if (m.missing.length) need.push(`卡池里没对上：${m.missing.map((u) => esc(u.name)).join('、')}（可能是别赛季棋子或名字写法不同）`);
  if (m.componentMissing.length) need.push(`散件没对上：${m.componentMissing.map(esc).join('、')}`);
  box.innerHTML =
    `<div class="snap-row"><span class="snap-k">识别</span><span class="snap-v">${head.map((h) => `<span class="tchip">${h}</span>`).join('')}</span></div>` +
    row('待核对棋子', m.candidates, 'candidates') + row('场上', m.board, 'board') + row('备战席', m.bench, 'bench') + row('商店', m.shop, 'shop') +
    traitRow('截图羁绊', m.traits, '未读到') + (board.length ? traitRow('场上复算', calculated, '按已确认棋子暂无激活羁绊') : '') +
    inventory('散件', m.components) + inventory('未装备成装', m.items) +
    (m.matchFrame && !snap.applied && m.candidates.length ? `<div class="snap-actions snap-load-actions"><button class="primary" data-snap-apply ${locked || !autoSelect(m).ids.length ? 'disabled' : ''}>应用到推荐</button></div>` : '') +
    (m.notes ? `<p class="fine">补充：${esc(m.notes)}</p>` : '') +
    (need.length ? `<p class="snap-miss">${need.join('<br />')}</p>` : '');
}

async function importSnapshot(read) {
  const snap = state.snap;
  if (snap.busy || snap.importing) return;
  snap.importing = true;
  snap.error = null;
  snap.ai = null;
  renderSnapshot();
  let thumb;
  try {
    const file = await read();
    if (!file) return;
    if (file.size > MAX_SOURCE_BYTES) throw new Error('请选择不超过 20 MB 的图片。');
    const kind = await imageKind(file);
    if (!kind) throw new Error('请选择 JPG、PNG、WebP、GIF、BMP 或 AVIF 图片。');
    const source = file.type === kind ? file : new Blob([file], { type: kind });
    thumb = URL.createObjectURL(source);
    const preview = new Image();
    preview.src = thumb;
    try { await preview.decode(); } catch { throw new Error('图片无法解码，请换一张或转成 PNG 后再试。'); }
    if (snap.thumb) URL.revokeObjectURL(snap.thumb);
    Object.assign(snap, { file: source, thumb, rotation: 0, mapped: null, applied: false });
    thumb = null;
  } catch (error) {
    snap.error = { message: error.message };
  } finally {
    if (thumb) URL.revokeObjectURL(thumb);
    snap.importing = false;
    renderSnapshot();
  }
}

const setSnapFile = (file) => importSnapshot(() => file);

async function readClipboardImage() {
  try {
    const entries = await navigator.clipboard.read();
    for (const entry of entries) {
      const type = entry.types.find((candidate) => looksLikeImage({ type: candidate }));
      if (type) return await entry.getType(type);
    }
  } catch {
    throw new Error('无法读取剪贴板，请按 Ctrl+V 粘贴或选择文件。');
  }
  throw new Error('剪贴板里没有可导入的图片。');
}

function applySnapshot() {
  const snap = state.snap;
  if (!snap.mapped?.matchFrame || snap.applied || snap.busy || snap.importing) return;
  const { ids } = autoSelect(snap.mapped);
  if (!ids.length) return;
  ids.forEach((id) => state.selected.add(id));
  for (const { id, count } of snap.mapped.components) {
    if (id) state.owned.set(id, Math.max(state.owned.get(id) || 0, Math.min(4, count)));
  }
  for (const { id } of snap.mapped.items) if (id) state.ownedItems.add(id);
  if (snap.mapped.level >= 5 && snap.mapped.level <= 10) {
    state.level = snap.mapped.level;
  }
  snap.applied = true;
  renderUnits();
  renderResults();
  renderSnapshot();
}

async function runRecognize(enhanced = false) {
  if (loadingSet || !state.snap.file || state.snap.busy || state.snap.importing || !state.setData?.units.length) return;
  const set = state.meta;
  const generation = boardLoad;
  const current = () => state.meta === set && generation === boardLoad;
  state.snap.busy = true;
  state.snap.enhancing = enhanced;
  state.snap.ai = null;
  state.snap.error = null;
  state.snap.mapped = null;
  state.snap.applied = false;
  renderSnapshot();
  try {
    const ctx = openingContext();
    const result = await recognizeSnapshot(state.snap.file, state.snap.rotation, state.setData, current, {
      cities: ctx.cities, augments: ctx.augments,
    }, enhanced);
    if (!result || !current()) return;
    state.snap.ai = result.ai;
    state.snap.timedOut = result.timedOut;
    if (!result.stage && !result.candidates.length && !result.traits.length) {
      state.snap.error = { message: result.timedOut
        ? '识别已到等待上限，可直接核对已登记的棋子和装备，或裁出商店和羁绊区域重试。'
        : '没有读到当前赛季的棋子名或羁绊名。请核对游戏与赛季，并使用原始截图或裁出名称较清晰的区域。' };
      return;
    }
    state.snap.mapped = matchSnapshot(result, { setData: state.setData, itemsData: state.items });
    if (result.stage === '2-1' && result.matchFrame) {
      openingAdvice.receive({
        units: state.snap.mapped.candidates.map(row => row.id).filter(Boolean), opening: result.opening,
      });
      openingAdvice.show();
    }
  } catch (error) {
    if (current()) state.snap.error = { message: error?.message || '识别失败了。' };
  } finally {
    state.snap.busy = false;
    renderSnapshot();
  }
}

function clearSnapshot() {
  if (state.snap.thumb) URL.revokeObjectURL(state.snap.thumb);
  state.snap.file = null;
  state.snap.rotation = 0;
  state.snap.thumb = '';
  state.snap.error = null;
  state.snap.ai = null;
  state.snap.mapped = null;
  state.snap.applied = false;
  el('snapFile').value = '';
  renderSnapshot();
}

function bind() {
  matchSamples = bindMatchSamples({
    panel: el('matchSamples'), input: el('matchSampleFiles'), clear: el('clearMatchSamples'),
    status: el('matchSampleStatus'), output: el('matchSampleOutput'),
    getContext: () => state.sourceId === 'datatft' && state.board?.version === '18.7' && state.comps.length
      ? { comps: state.comps, setData: state.setData } : null,
  });
  openingAdvice = bindOpeningAdvice({
    dialog: el('openingDialog'), open: el('openingOpen'), city: el('openingCity'), economy: el('openingEconomy'),
    item: el('openingItem'), addItem: el('openingAddItem'), removeItem: el('openingRemoveItem'),
    unitSelect: el('openingUnit'), toggleUnit: el('openingToggleUnit'), ownedSummary: el('openingOwned'), candidates: el('openingCandidates'),
    inputs: ['openingHex1', 'openingHex2', 'openingHex3'].map(el), list: el('openingHexList'),
    tier: el('openingHexTier'), tierStatus: el('openingHexTierStatus'),
    direction: el('openingDirection'), picks: el('openingPicks'), getContext: openingContext,
    onChange({ city, economy, item, delta, unit, selected }) {
      if (city != null) state.openingCity = city;
      if (economy != null) state.economy = economy;
      if (item && state.items?.components.some(component => component.id === item)) {
        const count = Math.max(0, Math.min(4, (state.owned.get(item) || 0) + delta));
        count ? state.owned.set(item, count) : state.owned.delete(item);
      } else if (item && delta > 0) {
        state.ownedItems.add(item);
      } else if (item) {
        state.ownedItems.delete(item);
      }
      if (unit) {
        if (selected) state.selected.add(unit);
        else state.selected.delete(unit);
        renderUnits();
      }
      if (state.setData) renderResults();
    },
    onPick(id) {
      if (state.openingAugment) state.chosen.delete(state.openingAugment);
      state.openingAugment = id;
      state.chosen.add(id);
      renderResults();
      if (!el('screenFinish').disabled) el('screenFinish').click();
    },
    onTier(tier) {
      const filter = el('augmentTierFilter');
      if (filter.value === tier) return;
      filter.value = tier;
      renderHexes((state.ranked || []).find(row => row.viable));
    },
  });
  screenReader = bindScreenReader({
    start: el('screenStart'), finish: el('screenFinish'), stop: el('screenStop'), photo: el('screenPhoto'),
    video: el('screenVideo'), status: el('screenStatus'), result: el('screenDirection'),
    getContext: () => {
      const context = openingContext();
      if (!context?.comps.length) return null;
      return {
        setData: context.setData,
        opening: { cities: context.cities, augments: context.augments },
        ranked: () => state.ranked || [],
      };
    },
    isOpponentView: () => Boolean(el('scoutView').value),
    onEvidence: openingAdvice.receive,
    onOpening: openingAdvice.show,
  });
  scout = bindOpponentScout({
    view: el('scoutView'), capture: el('scoutCapture'), photo: el('scoutPhoto'), iconPhoto: el('scoutIconPhoto'),
    economy: el('scoutEconomy'), augment: el('scoutAugment'), saveProfile: el('scoutSaveProfile'),
    clear: el('scoutClear'), clearAll: el('scoutClearAll'), status: el('scoutStatus'), summary: el('scoutSummary'),
    getContext: () => !loadingSet && state.setData ? {
      setData: state.setData, comps: state.comps, boards: state.opponentBoards, patch: state.board?.version,
      augments: state.augs?.augments || [],
    } : null,
    getFrame: screenReader.getFrame,
    hasSharedStream: screenReader.hasSharedStream,
    onViewChange: () => screenReader.perspectiveChanged(),
    onChange(slot, observation) {
      if (slot === null) state.opponentBoards.clear();
      else if (observation) state.opponentBoards.set(slot, observation);
      else state.opponentBoards.delete(slot);
      if (state.setData && !loadingSet) renderResults();
    },
  });
  modelReference = bindModelReference({
    file: el('modelFile'), unit: el('modelUnit'), display: el('modelDisplay'),
    angle: el('modelAngle'), use: el('modelUse'), useAll: el('modelUseAll'),
    clear: el('modelClear'), status: el('modelStatus'), preview: el('modelReferencePreview'),
    game: el('modelGame'), save: el('modelSave'), load: el('modelLoad'), remove: el('modelRemove'),
  });
  iconMatch = bindIconMatch({
    kind: el('iconKind'), input: el('iconFile'), status: el('iconStatus'), apply: el('iconApply'),
    getContext: kind => loadingSet ? null : ({
      version: state.setData?.source?.ddragonVersion,
      entries: kind === 'unit' ? state.setData?.units || [] : [...(state.items?.components || []), ...(state.items?.items || [])],
    }),
    onApply(icon, kind) {
      if (kind === 'unit') {
        state.selected.add(icon.id);
        renderUnits();
      } else if (state.items.components.some(component => component.id === icon.id)) {
        state.owned.set(icon.id, Math.min(4, (state.owned.get(icon.id) || 0) + 1));
      } else {
        state.ownedItems.add(icon.id);
      }
      renderResults();
    },
  });
  el('setSelect').innerHTML = SETS.map((s) => `<option value="${s.set}">${esc(s.label)}${s.status === 'preview' ? ' · 待上线' : ''}</option>`).join('');
  el('boardSource').replaceChildren(...BOARD_SOURCES.map(({ id, host, game }) => new Option(`${game} · ${host}`, id)));
  el('boardSource').value = state.sourceId;
  el('boardSource').onchange = (event) => {
    state.sourceId = sourceFor(event.target.value).id;
    modelReference.setScope(state.sourceId, !loadingSet && state.setData?.units.length ? state.setData.set : null, sourceFor(state.sourceId).game);
    try { localStorage.setItem(SOURCE_KEY, state.sourceId); } catch { /* session choice still works */ }
    void loadBoard();
  };
  el('setSelect').onchange = (e) => loadSet(e.target.value);
  el('planTrait').onchange = () => { refreshPlanTiers(); renderResults(); };
  el('planTier').onchange = renderResults;
  el('planCap').onchange = renderResults;
  el('augmentTierFilter').onchange = () => renderHexes((state.ranked || []).find(row => row.viable));
  el('search').oninput = (e) => { state.query = e.target.value.trim(); renderUnits(); };
  el('clearSel').onclick = () => { state.selected.clear(); renderUnits(); renderResults(); };
  el('costTabs').onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    state.cost = b.dataset.cost === '' ? null : Number(b.dataset.cost);
    renderCostTabs();
    renderUnits();
  };
  el('unitGrid').onclick = (e) => {
    const b = e.target.closest('.unit');
    if (!b) return;
    state.selected.has(b.dataset.id) ? state.selected.delete(b.dataset.id) : state.selected.add(b.dataset.id);
    renderUnits();
    renderResults();
  };
  el('selectedList').onclick = (e) => {
    const b = e.target.closest('.unit');
    if (!b) return;
    state.selected.delete(b.dataset.id);
    renderUnits();
    renderResults();
  };
  el('comps').onclick = async (e) => {
    const a = e.target.closest('.comp');
    if (!a) return;
    const id = a.dataset.comp;
    if (e.target.closest('[data-copy-team]')) {
      const code = state.comps.find(comp => comp.id === id)?.teamCode;
      const feedback = a.querySelector('.copy-status');
      if (!code || !feedback) return;
      try {
        await navigator.clipboard.writeText(code);
        feedback.textContent = '阵容码已复制。';
      } catch {
        feedback.textContent = code;
      }
      return;
    }
    if (!e.target.closest('.comp-head')) return;
    state.open.has(id) ? state.open.delete(id) : state.open.add(id);
    renderResults();
  };
  el('compGrid').onclick = (e) => {
    const b = e.target.closest('.ic');
    if (!b) return;
    const id = b.dataset.comp;
    // 散件按 0→1→2→3→4 循环：一件最多同时握 4 个也是常见情况(打野/野怪轮)。
    const next = ((state.owned.get(id) || 0) + 1) % 5;
    next ? state.owned.set(id, next) : state.owned.delete(id);
    renderResults();
  };
  el('clearComps').onclick = () => {
    state.owned.clear();
    state.ownedItems.clear();
    renderResults();
  };
  el('paths').onclick = (e) => {
    const b = e.target.closest('.cand');
    if (!b) return;
    state.selected.add(b.dataset.id);
    renderUnits();
    renderResults();
  };
  el('hexes').onclick = (e) => {
    const b = e.target.closest('.hex');
    if (!b) return;
    state.chosen.has(b.dataset.hex) ? state.chosen.delete(b.dataset.hex) : state.chosen.add(b.dataset.hex);
    renderResults();
  };
  el('gear').onclick = (e) => {
    const b = e.target.closest('.gi');
    if (!b) return;
    state.ownedItems.has(b.dataset.item) ? state.ownedItems.delete(b.dataset.item) : state.ownedItems.add(b.dataset.item);
    renderResults();
  };
  // 快照导入：文件选择 / 拖拽 / 粘贴三种入口，识别结果只做「勾选」，推荐仍由本地引擎出。
  el('snapFile').onchange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void setSnapFile(file);
  };
  el('snapPaste').onclick = () => importSnapshot(readClipboardImage);
  el('snapUrlForm').onsubmit = (e) => {
    e.preventDefault();
    const url = el('snapUrl').value;
    void importSnapshot(() => importImageUrl(url));
  };
  el('snapRotate').onclick = () => {
    state.snap.rotation = (state.snap.rotation + 90) % 360;
    Object.assign(state.snap, { mapped: null, applied: false, error: null });
    renderSnapshot();
  };
  el('snapRun').onclick = () => runRecognize();
  el('snapAi').onclick = () => runRecognize(true);
  el('snapClear').onclick = clearSnapshot;
  const drop = el('snapDrop');
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => setSnapFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]));
  document.addEventListener('paste', (e) => {
    const files = [...((e.clipboardData && e.clipboardData.items) || [])]
      .filter((x) => x.kind === 'file')
      .map((x) => x.getAsFile())
      .filter(Boolean);
    // 没有 image MIME 的剪贴板文件（部分截图工具）也放行，格式由 imageKind 嗅探决定。
    const file = files.find(looksLikeImage) || e.clipboardData?.files?.[0] || files[0];
    if (file) { e.preventDefault(); void setSnapFile(file); }
  });
  el('snapResult').onclick = (e) => {
    if (e.target.closest('[data-snap-apply]')) { applySnapshot(); return; }
    if (!state.snap.mapped?.matchFrame || state.snap.busy || state.snap.importing) return;
    const chip = e.target.closest('[data-snap],[data-var]');
    if (chip) {
      const id = chip.dataset.id;
      const row = chip.dataset.var ? snapRow(chip.dataset.var) : null;
      if (row) {
        row.id = id;
        row.variants = null;
        row.excluded = false;
        if (!state.snap.applied && !chip.dataset.var.startsWith('shop:')) { renderSnapshot(); return; }
      }
      if (!state.snap.applied && chip.dataset.snap && !chip.dataset.snap.startsWith('shop:')) {
        const candidate = snapRow(chip.dataset.snap);
        if (candidate) candidate.excluded = !candidate.excluded;
        renderSnapshot();
        return;
      }
      state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id);
      renderUnits();
      renderResults();
      renderSnapshot();
      return;
    }
    const miss = e.target.closest('[data-miss]');
    if (miss) {
      const row = snapRow(miss.dataset.miss);
      if (row) { state.query = row.name; el('search').value = row.name; renderUnits(); el('search').focus(); }
    }
  };
  // 便于在控制台手测引擎：state 暴露给 window
  window.__tft = { state, recommend, validateComps, traitPaths, rankAugments, planItems, matchSnapshot, setSnapFile, runRecognize, clearSnapshot };
}

bind();
loadSet(SETS[0].set);
