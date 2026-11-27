export const catalogName = name => name.normalize('NFKC').trim().toLocaleLowerCase('zh-CN');

const EQUIPMENT_ALIASES_18_7 = [
  ['DA_Component_BFSword', '暴风大剑', 'jcc-item:1001', '暴风之剑'],
  ['DA_Deathblade', '死亡之刃', 'jcc-item:2045', '锐利之刃'],
];

export function compareCatalogEntries(left, right, query = '', filter = 'all', { category, version } = {}) {
  const rows = new Map();
  const identities = new Map();
  if (category === 'items' && version === '18.7') {
    for (const [a, leftName, b, rightName] of EQUIPMENT_ALIASES_18_7) {
      if (left.some(entry => entry.id === a && entry.name === leftName) && right.some(entry => entry.id === b && entry.name === rightName)) {
        identities.set(a, a);
        identities.set(b, a);
      }
    }
  }
  function collect(entries, side) {
    for (const entry of entries) {
      const key = identities.get(entry.id) || catalogName(entry.name);
      if (!rows.has(key)) rows.set(key, { left: [], right: [] });
      rows.get(key)[side].push(entry);
    }
  }
  collect(left, 'left');
  collect(right, 'right');
  return [...rows.values()].filter(row => {
    if (![...row.left, ...row.right].some(entry => catalogName(entry.name).includes(query))) return false;
    if (filter === 'shared') return row.left.length && row.right.length;
    if (filter === 'datatft') return !row.right.length;
    if (filter === 'dataj') return !row.left.length;
    return true;
  });
}
