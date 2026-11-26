// Canonical IDs from DataJ 18.7 lineup details, filtered by the DataJ 2-1 stage table.
// Sources: https://www.dataj.cc/comp/<id> and https://www.dataj.cc/hex
// Checked 2026-11-26. Array order carries no ranking weight.
export const datajOpeningAugments = {
  84: ['DA_URF', 'DA_SpreadingRoots', 'DA_PortableForge'],
  87: ['DA_PortableForge', 'DA_LivingForge', 'DA_RadiantRelic', 'DA_LatentForge', 'DA_TeamBuilding'],
  89: ['DA_LateGameScaling', 'DA_BirthdayReunion', 'DA_18_CovenTraitAugment', 'DA_LevelUp'],
  90: ['DA_SpreadingRoots', 'DA_BacklineBlueprint', 'DA_18_FloraFatalisAugment'],
  91: ['DA_LevelUp', 'DA_BirthdayReunion', 'DA_LateGameScaling', 'DA_HardBargain', 'DA_SpreadingRoots'],
  95: ['DA_PortableForge', 'DA_CapitalGainsII'],
  96: ['DA_PortableForge', 'DA_LegionOfThrees', 'DA_SpeedyDoubleKill'],
  98: ['DA_18_FaeTraitAugment', 'DA_GoldDestiny', 'DA_SpreadingRoots', 'DA_18_SprykinAugment', 'DA_LegionOfThrees'],
  99: ['DA_18_RiftbeastTraitAugment', 'DA_PortableForge', 'DA_CookingPot'],
  100: ['DA_Expedition', 'DA_DeadlierBlades', 'DA_PortableForge', 'DA_RadiantRelic', 'DA_18_CovenTraitAugment'],
  102: ['DA_PortableForge'],
  104: ['DA_18_RiftbeastTraitAugment', 'DA_SeraphimsStaff', 'DA_PortableForge'],
  105: ['DA_URF', 'DA_SpreadingRoots'],
  106: ['DA_Expedition', 'DA_DeadlierBlades', 'DA_PortableForge', 'DA_RadiantRelic'],
  107: ['DA_18_RiftbeastTraitAugment', 'DA_SeraphimsStaff', 'DA_DeadlierCaps'],
  108: ['DA_SpreadingRoots', 'DA_PortableForge'],
  110: ['DA_URF', 'DA_PortableForge', 'DA_18_SolarTraitAugment'],
  112: ['DA_URF', 'DA_SpreadingRoots'],
  113: ['DA_BirthdayReunion', 'DA_LevelUp', 'DA_LateGameScaling', 'DA_HardBargain'],
  115: ['DA_EarlyLearnings', 'DA_PortableForge', 'DA_NoScoutNoPivot'],
  116: ['DA_PortableForge', 'DA_SoloLeveling', 'DA_RadiantRelic', 'DA_DeadlierCaps', 'DA_TeamBuilding'],
  117: ['DA_SeraphimsStaff', 'DA_PortableForge', 'DA_FrontlineFoundation'],
  120: ['DA_18_CovenTraitAugment_LootToAP', 'DA_GoldDestiny', 'DA_PortableForge'],
  121: ['DA_BlackthornTraitAugment', 'DA_LegionOfThrees', 'DA_DeadlierCaps', 'DA_SpreadingRoots'],
};

// Ranked S18 18.7 guides matched by roster and main carry.
export const tftOpeningAugments = {
  // https://lum.gg/zh-cn/tft/team/akali-inferno
  'datatft-16269': {
    source: 'LUM.GG',
    roster: ['DA_18_Akali_AD', 'DA_18_Ornn', 'DA_18_Camille', 'DA_18_Leona', 'DA_18_Sejuani', 'DA_18_Varus', 'DA_18_Kayle'],
    ids: ['DA_EarlyLearnings', 'DA_PandorasBench', 'DA_NoScoutNoPivot', 'DA_PortableForge'],
  },
  // https://lum.gg/zh-cn/tft/team/veigar-spellweaver
  'datatft-16286': {
    source: 'LUM.GG',
    roster: ['DA_18_Ornn', 'DA_18_Alistar', 'DA_18_RekSai', 'DA_Fiddlesticks18', 'DA_18_LeBlanc', 'DA_18_Veigar', 'DA_18_Cassiopeia'],
    ids: ['DA_BlackthornTraitAugment', 'DA_PandorasBench', 'DA_TradeSector'],
  },
};
