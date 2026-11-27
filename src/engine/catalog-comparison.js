export const catalogName = name => name.normalize('NFKC').trim().toLocaleLowerCase('zh-CN');

export function compareCatalogEntries(left, right, query = '', filter = 'all') {
  const rows = new Map();
  function collect(entries, side) {
    for (const entry of entries) {
      const key = catalogName(entry.name);
      if (!key.includes(query)) continue;
      if (!rows.has(key)) rows.set(key, { left: [], right: [] });
      rows.get(key)[side].push(entry);
    }
  }
  collect(left, 'left');
  collect(right, 'right');
  return [...rows.values()].filter(row => {
    if (filter === 'shared') return row.left.length && row.right.length;
    if (filter === 'datatft') return !row.right.length;
    if (filter === 'dataj') return !row.left.length;
    return true;
  });
}
