import { readFile } from 'node:fs/promises';
import { adaptBoard } from '../src/adapters/board-sources.js';
import { validateComps } from '../src/adapters/provider.js';
import { aggregateTftMatches, unpackMatchFile } from '../src/engine/match-samples.js';

const paths = process.argv.slice(2);
if (!paths.length) throw new Error('用法：node scripts/aggregate-tft-matches.mjs 对局1.json 对局2.json');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const [setData, items, rawBoard] = await Promise.all([
  json(new URL('../src/data/set18.json', import.meta.url)),
  json(new URL('../src/data/set18.items.json', import.meta.url)),
  json(new URL('../src/data/datatft/s18.18.7.comps.json', import.meta.url)),
]);
const { comps } = validateComps(adaptBoard(rawBoard, { source: 'datatft', setData, items }).comps, setData);
const report = aggregateTftMatches((await Promise.all(paths.map(async path => unpackMatchFile(await json(path))))).flat(), {
  setData, comps,
});
if (!report.matchedBoards) throw new Error('没有可匹配阵容的 S18 18.7 排位终局棋盘。');
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
