// 赛季注册表：一个赛季一份卡池 + 一份阵容库，切换赛季等于换数据命名空间。
// status: live(正式服可用) / preview(数据未落地，界面降级说明)
export const SETS = [
  {
    set: 18,
    label: 'S18 自然之力',
    status: 'live',
    window: '2026-08-27 国服上线 · 2026-12-03 被 S19 替换',
    dataFile: './src/data/set18.json',
    libraryFile: './src/data/library/set18.comps.json',
    refFile: './src/data/library/set18.ref.json',
    itemsFile: './src/data/set18.items.json',
    augFile: './src/data/set18.augments.json',
  },
  {
    set: 19,
    label: 'S19 棱彩音乐盛典',
    status: 'preview',
    window: '国际服 2026-12-01 / 国服 2026-12-03 上线',
    dataFile: './src/data/set19.json',
    libraryFile: './src/data/library/set19.comps.json',
    itemsFile: './src/data/set19.items.json',
    augFile: './src/data/set19.augments.json',
  },
];

export const findSet = (num) => SETS.find((s) => s.set === Number(num)) || SETS[0];
