import { findSet } from '../data/sets.js';

const TITLES = [
  ['datatft', '云顶之弈', /云顶之弈|TeamfightTactics/i],
  ['dataj', '金铲铲之战', /金铲铲之战|BattleofGoldenSpatula/i],
];

export function screenScopeMismatch(text, scope) {
  if (!text || !scope) return null;
  const visible = text.normalize('NFKC').replace(/[^\S\n]+/g, '');
  const games = TITLES.filter(([, , pattern]) => pattern.test(visible));
  const identified = games.length === 1 ? games[0] : null;
  const patches = new Set(Array.from(visible.matchAll(/(?:版本|PATCH|VER\.?)[:：v]?(\d{1,2}\.\d{1,2}(?:\.\d+)?[a-z]?)(?![\d.])/gi), match => match[1].toLowerCase()));
  const seasons = new Set(Array.from(visible.matchAll(/(?:赛季[:：]?S?(\d{1,2})|(?:^|\n)S(\d{1,2})赛季)(?!\d)/gi), match => Number(match[1] || match[2])));
  if (identified && identified[0] !== scope.sourceId) {
    return `画面显示「${identified[1]}」，当前选择为「${scope.game}」。请切换游戏端后重新识别。`;
  }
  // Client build numbers can differ from the ranked-data patch, for example TFT 16.23.1.
  const patch = [...patches][0];
  const patchMajor = Number(patch?.split('.')[0]);
  if ((seasons.size === 1 && !seasons.has(scope.season)) ||
      (patches.size === 1 && (patchMajor === scope.season || findSet(patch)) && patch !== scope.version)) {
    return `画面版本与所选的 ${scope.game} ${scope.version} 不一致。请核对版本后重新识别。`;
  }
  return null;
}
