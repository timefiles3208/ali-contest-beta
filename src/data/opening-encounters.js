// DataTFT S18 18.7, https://www.datatft.com/database?season=18#region
// Effect categories are recommendation heuristics.
export const S18_OPENINGS = [
  ['基础装备锻造器', '开局获得 2 个基础装备锻造器。', 'items'],
  ['金金金之旅', '三个强化符文均为黄金阶。', 'neutral', 'gold'],
  ['嚎哭深渊', '开局获得 5 个随机 1 费棋子。', 'early'],
  ['最终决战', '只剩两名玩家时，各获得 70 金币。', 'neutral'],
  ['升级版开局', '初始棋子提升至 2 星。', 'early'],
  ['2费开局', '开局获得一个随机 2 费棋子。', 'early'],
  ['成装锻造器', '开局获得 1 个成装锻造器。', 'items'],
  ['3费开局', '开局获得一个随机 3 费棋子。', 'early'],
  ['棱彩终局', '最后一个强化符文为棱彩阶。', 'neutral'],
  ['金币订阅', '每阶段开始获得额外金币。', 'gold'],
  ['棱彩开局', '第一个强化符文为棱彩阶。', 'neutral', 'prismatic'],
  ['侦察小队', '增加 1 次强化符文刷新机会。', 'neutral'],
  ['更便宜的等级', '各级所需经验减少 2。', 'level'],
  ['黄金前奏', '第一个强化符文为黄金阶。', 'neutral', 'gold'],
  ['黄金终章', '最后一个强化符文为黄金阶。', 'neutral'],
  ['没有奇遇', '本局没有开局奇遇效果。', 'neutral'],
  ['装备锻炉', '开局获得 2 个成装锻造器。', 'items'],
  ['纹章剧团', '开局获得 3 个随机纹章。', 'emblems'],
  ['刷新次数订阅', '每阶段获得免费商店刷新次数。', 'rerolls'],
  ['彩彩彩之旅', '三个强化符文均为棱彩阶。', 'neutral', 'prismatic'],
].map(([name, description, effect, firstAugmentTier]) => ({ id: name, name, description, effect, firstAugmentTier }));

export const OPENING_EFFECTS = [
  { id: 'manual-level', name: '升级更便宜', effect: 'level' },
  { id: 'manual-gold', name: '额外金币', effect: 'gold' },
  { id: 'manual-rerolls', name: '免费商店刷新', effect: 'rerolls' },
  { id: 'manual-early', name: '开局额外棋子', effect: 'early' },
  { id: 'manual-items', name: '开局额外装备', effect: 'items' },
  { id: 'manual-emblems', name: '开局额外纹章', effect: 'emblems' },
  { id: 'manual-neutral', name: '没有额外效果', effect: 'neutral' },
];
