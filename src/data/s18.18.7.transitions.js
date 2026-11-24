// TFT Codex 18.7 boards explicitly marked as suggested. Keys identify DataTFT snapshot rows.
export const transitionGuides = {
  'datatft-16230': {
    slug: 'fae-tristana',
    anchors: ['DA_18_Tristana', 'DA_18_Rammus', 'DA_18_Rakan', 'DA_18_Sivir'],
    stages: {
      4: ['DA_Cinderling18', 'DA_18_Rakan', 'DA_18_Caitlyn', 'DA_18_Tristana'],
      5: ['DA_Cinderling18', 'DA_18_Kobuko', 'DA_18_Rakan', 'DA_18_Caitlyn', 'DA_18_Tristana'],
      6: ['DA_18_Kobuko', 'DA_18_Rakan', 'DA_18_Rammus', 'DA_18_Tristana', 'DA_18_Caitlyn', 'DA_Cinderling18'],
    },
  },
  'datatft-16233': {
    slug: 'elderwood-ezreal-c_fqk27t',
    anchors: ['DA_18_Ezreal', 'DA_18_Soraka', 'DA_18_Ornn', 'DA_18_Hecarim'],
    stages: {
      4: ['DA_18_Ornn', 'DA_18_Veigar', 'DA_18_Alistar', 'DA_18_LeBlanc'],
      7: ['DA_18_Ornn', 'DA_18_Alistar', 'DA_18_LeBlanc', 'DA_Fiddlesticks18', 'DA_18_Hecarim', 'DA_18_Ezreal', 'DA_18_Yunara'],
    },
  },
  'datatft-16266': {
    slug: 'invoker-ahri',
    anchors: ['DA_18_Ahri', 'DA_18_Morgana', 'DA_Krug18', 'DA_Karma18'],
    stages: {
      4: ['DA_Karma18', 'DA_18_Sentry', 'DA_18_Teemo', 'DA_Krug18'],
      5: ['DA_Karma18', 'DA_18_Sentry', 'DA_Scuttlecrab18', 'DA_18_Teemo', 'DA_Krug18'],
      6: ['DA_Karma18', 'DA_18_Sentry', 'DA_Krug18', 'DA_18_Teemo', 'DA_Scuttlecrab18', 'DA_Fiddlesticks18'],
    },
  },
  'datatft-16269': {
    slug: 'solar-akali',
    anchors: ['DA_18_Akali_AD', 'DA_18_Camille', 'DA_18_Leona', 'DA_18_Ornn'],
    stages: {
      4: ['DA_18_Akali_AD', 'DA_18_Leona', 'DA_18_Ornn', 'DA_18_Varus'],
    },
  },
  'datatft-16280': {
    slug: 'juggernaut-caitlyn',
    anchors: ['DA_18_Caitlyn', 'DA_18_Sivir', 'DA_18_Sejuani', 'DA_Vi18'],
    stages: {
      4: ['DA_18_Rakan', 'DA_18_Yorick', 'DA_Scuttlecrab18', 'DA_18_Sejuani'],
      5: ['DA_18_Rakan', 'DA_Scuttlecrab18', 'DA_18_Sejuani', 'DA_Vi18', 'DA_18_Yorick'],
    },
  },
  'datatft-16286': {
    slug: 'elderwood-veigar',
    anchors: ['DA_18_Veigar', 'DA_18_Alistar', 'DA_18_LeBlanc', 'DA_18_RekSai'],
    stages: {
      4: ['DA_18_RekSai', 'DA_18_Veigar', 'DA_18_Alistar', 'DA_18_LeBlanc'],
    },
  },
  'datatft-16287': {
    slug: 'inferno-ashe',
    anchors: ['DA_18_Ashe', 'DA_18_Sivir', 'DA_Vi18', 'DA_18_Varus'],
    stages: {
      4: ['DA_18_Akali_AD', 'DA_18_Varus', 'DA_18_Shen', 'DA_Vi18'],
      5: ['DA_18_Akali_AD', 'DA_18_Varus', 'DA_Scuttlecrab18', 'DA_18_Shen', 'DA_Vi18'],
      6: ['DA_18_Caitlyn', 'DA_Scuttlecrab18', 'DA_18_Shen', 'DA_Vi18', 'DA_18_Varus', 'DA_18_Akali_AD'],
    },
  },
  'datatft-16296': {
    slug: 'juggernaut-zyra',
    anchors: ['DA_18_Zyra', 'DA_18_Sejuani', 'DA_18_Yorick', 'DA_Vi18'],
    stages: {
      4: ['DA_18_Rakan', 'DA_18_Yorick', 'DA_Scuttlecrab18', 'DA_18_Sejuani'],
      5: ['DA_18_Rakan', 'DA_Scuttlecrab18', 'DA_18_Sejuani', 'DA_Vi18', 'DA_18_Yorick'],
    },
  },
  'datatft-16297': {
    slug: 'elderwood-kha-zix',
    anchors: ['DA_18_KhaZix', 'DA_18_Hecarim', 'DA_18_Ornn', 'DA_Fiddlesticks18'],
    stages: {
      4: ['DA_18_Ornn', 'DA_18_Xayah', 'DA_18_LeBlanc', 'DA_Fiddlesticks18'],
      5: ['DA_18_Ornn', 'DA_18_Xayah', 'DA_18_Alistar', 'DA_18_LeBlanc', 'DA_Fiddlesticks18'],
      6: ['DA_18_Ornn', 'DA_Fiddlesticks18', 'DA_18_KhaZix', 'DA_18_LeBlanc', 'DA_18_Alistar', 'DA_18_Xayah'],
    },
  },
  'datatft-16315': {
    slug: 'solar-aphelios',
    anchors: ['DA_18_Aphelios', 'DA_Amumu18', 'DA_18_Leona', 'DA_18_Sejuani'],
    stages: {
      4: ['DA_18_Leona', 'DA_18_Rakan', 'DA_18_Kayle', 'DA_18_Sejuani'],
      5: ['DA_18_Leona', 'DA_18_Rakan', 'DA_18_Kayle', 'DA_18_Sejuani', 'DA_18_Diana'],
      7: ['DA_18_Leona', 'DA_18_Kayle', 'DA_18_Sejuani', 'DA_18_Diana', 'DA_18_Aphelios', 'DA_18_Rakan', 'DA_18_Xayah'],
    },
  },
  'datatft-16327': {
    slug: 'sprykin-teemo',
    anchors: ['DA_18_Teemo', 'DA_18_Alistar', 'DA_18_Kobuko', 'DA_18_Veigar'],
    stages: {
      4: ['DA_18_Kobuko', 'DA_18_Veigar', 'DA_18_LeBlanc', 'DA_18_Teemo'],
    },
  },
  'datatft-16335': {
    slug: 'solar-xayah',
    anchors: ['DA_18_Xayah', 'DA_18_Kayle', 'DA_18_Rakan', 'DA_18_Sejuani'],
    stages: {
      4: ['DA_18_Rakan', 'DA_18_Xayah', 'DA_18_Kayle', 'DA_18_Sejuani'],
    },
  },
};
