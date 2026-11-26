import { formationPlan, formationRow } from './formation.js?v=opponent-artifacts';

// S18 artifacts and icons from the 16.23 CommunityDragon snapshot.
const ICON_ROOT = 'https://raw.communitydragon.org/16.23/game/assets/maps/';
const artifacts = {
  idol: ['禁忌雕像', 'tft_item_artifact_forbiddenidol', '把部分护盾转化为最大生命值，适合能反复给自己套盾的奥恩'],
  crest: ['光盾徽章', 'tft_item_artifact_lightshieldcrest', '按携带者双抗为低血量友军提供护盾，适合高双抗前排'],
  dawnShield: ['黎明圣盾', 'tft_item_artifact_aegisofdawn', '补充前排护甲，适合承受物理伤害'],
  duskShield: ['黄昏圣盾', 'tft_item_artifact_aegisofdusk', '补充前排魔抗，适合承受魔法伤害'],
  manazane: ['魔蕴', 'tft4_item_ornnmuramana', '首次施法后回蓝，适合需要接续施法的棋子'],
  dawncore: ['黎明核心', 'tft_item_artifact_dawncore', '施法后逐步降低法力上限，适合反复施法'],
  lich: ['巫妖之祸', 'tft_item_artifact_lichbane', '施法后强化普攻，适合技能与普攻交替的输出棋子', 'particles/tft/item_icons/ornn_items/'],
  navori: ['烁刃', 'tft_item_artifact_navoriflickerplade', '通过不断普攻叠加收益，适合持续输出', null, '纳沃利烁刃'],
  cannon: ['疾射火炮', 'tft_item_artifact_rapidfirecannon', '增加攻击距离，击杀后还能继续提高射程'],
  shiv: ['斯塔缇克电刃', 'tft_item_artifact_stattikshiv', '普攻触发连锁闪电，适合高频普攻'],
  force: ['三相之力', 'tft4_item_ornninfinityforce', '提供多项属性，适合作为物理输出的通用备选'],
  seekers: ['探索者的护臂', 'tft_item_artifact_seekersarmguard', '提供法强和双抗，适合需要贴身作战的法系输出'],
};
const spellItems = new Set(['DA_SpearOfShojin', 'DA_BlueBuff', 'DA_ArchangelsStaff', 'DA_RabadonsDeathcap',
  'DA_JeweledGauntlet', 'DA_AdaptiveHelm', 'DA_VoidStaff']);
const attackItems = new Set(['DA_GuinsoosRageblade', 'DA_KrakensFury', 'DA_RedBuff', 'DA_Quicksilver']);
const physicalItems = new Set(['DA_Deathblade', 'DA_InfinityEdge', 'DA_LastWhisper', 'DA_Bloodthirster',
  'DA_TitansResolve', 'DA_SteraksGage', 'DA_StrikersFlail']);

function artifactDetails(keys, sourceItems) {
  return keys.flatMap(id => {
    const [name, file, reason, folder, alias] = artifacts[id];
    const sourceName = sourceItems?.has(name) ? name : alias && sourceItems?.has(alias) ? alias : null;
    if (sourceItems && !sourceName) return [];
    return [{ id, name: sourceName || name, icon: ICON_ROOT + (folder || 'tft/icons/items/hexcore/') + file + '.png', reason }];
  });
}

export function artifactOptions(patch, sourceItems) {
  return patch === '18.7' ? artifactDetails(Object.keys(artifacts), sourceItems) : [];
}

export function recommendArtifacts(unit, patch, sourceItems) {
  if (patch !== '18.7') return [];
  const items = unit.items || [];
  const keys = unit.id === 'DA_18_Ornn' ? ['idol', 'crest', 'duskShield', 'dawnShield']
    : unit.tank || unit.row === 0 ? ['crest', 'dawnShield', 'duskShield']
    : items.some(id => attackItems.has(id)) ? ['navori', 'cannon', 'shiv', 'force']
    : items.some(id => spellItems.has(id)) ? (unit.row === 1
      ? ['manazane', 'dawncore', 'seekers'] : ['manazane', 'dawncore', 'lich'])
    : items.some(id => physicalItems.has(id)) ? ['force', 'navori', 'cannon']
    : [];
  return artifactDetails(keys, sourceItems).slice(0, 3);
}

const ARTIFACT_AUGMENTS = new Set([
  'DA_PortableForge', 'DA_LatentForge', 'DA_LivingForge', 'DA_NestingAnvils', 'DA_NestingAnvilsPlus', 'DA_SweetTreats',
]);

export function artifactAugmentChoices(id, { comp, setData, patch, sourceItems, selected }) {
  if (!ARTIFACT_AUGMENTS.has(id) || patch !== '18.7' || !comp) return [];
  const formation = formationPlan(comp, new Map(setData.units.map(unit => [unit.id, unit])));
  const units = [...new Set([...formation.carries, ...formation.tanks, ...formation.chase])]
    .sort((a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id)));
  const options = units.map(unit => recommendArtifacts({ ...unit, row: formationRow(unit) }, patch, sourceItems)
    .map(item => ({ item, unit })));
  const firstChoices = options.flatMap(pairs => pairs.slice(0, 1));
  const allChoices = [...firstChoices, ...options.flatMap(pairs => pairs.slice(1))];
  return allChoices.filter(({ item }, i) => allChoices.findIndex(pair => pair.item.id === item.id) === i).slice(0, 2);
}
