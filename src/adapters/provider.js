// 爬取适配层：把「阵容从哪来」和「怎么推荐」彻底解耦。
//
// 约定（实现任何数据源都只要满足这个形状）：
//   fetchComps({ set, patch }) -> { meta, comps: Comp[] }
//
// Comp 字段：
//   id, name           必填
//   units[]            必填，成型单位 id（来自同赛季卡池，未知 id 会被 validateComps 剔除）
//   core[]             必填，核心件；玩家一个没摸到时该阵容降级为「转型参考」
//   level              建议成型人口
//   strength           0..1 强度权重；远端接入后由远端的胜率/前四率归一化得到
//   carry[] tank[] traits[] aimTraits{} notes econ diff   选填，仅用于展示
//
// 第一阶段只有 LocalLibraryProvider 在工作：不联网、不可被外部站点可用性阻塞。

const REQUIRED = ['id', 'name', 'units', 'core'];

export function validateComps(comps, setData) {
  const known = new Set(setData.units.map((u) => u.id));
  const issues = [];
  const clean = [];
  for (const comp of comps || []) {
    for (const key of REQUIRED) {
      if (comp[key] === undefined || comp[key] === null || (key !== 'core' && !comp[key]?.length)) {
        issues.push(`${comp.id || '?'} 缺字段 ${key}`);
      }
    }
    const unknown = (comp.units || []).filter((id) => !known.has(id));
    if (unknown.length) {
      issues.push(`${comp.id} 含非本赛季棋子，已丢弃该阵容：${unknown.join(', ')}`);
      continue;
    }
    clean.push({ ...comp, core: comp.core?.length ? comp.core : comp.units });
  }
  return { comps: clean, issues };
}

export class CompProvider {
  get name() {
    return 'abstract';
  }
  // eslint-disable-next-line no-unused-vars
  async fetchComps({ set, patch }) {
    throw new Error(`${this.name}: 未实现`);
  }
}

export class LocalLibraryProvider extends CompProvider {
  constructor(load) {
    super();
    this.load = load;
  }
  get name() {
    return 'local-library';
  }
  async fetchComps({ set }) {
    const raw = await this.load(set);
    if (!raw) throw new Error(`本地库没有 set ${set} 的阵容`);
    return { meta: { origin: this.name, ...raw.provenance }, comps: raw.comps };
  }
}

// 远端源的落点。真正接的时候在这里做「源格式 → Comp[]」映射，其余代码不动。
// 未配置 endpoint 时直接抛错，交给 chain 降级，绝不返回猜测出来的阵容。
export class RemoteCompProvider extends CompProvider {
  constructor(config = null) {
    super();
    this.config = config;
  }
  get name() {
    return 'remote';
  }
  async fetchComps({ set }) {
    if (!this.config?.endpoint) {
      throw new Error('未配置数据源（浏览器直连第三方阵容榜会被 CORS/403 拦掉，需要自建代理或改为构建期抓取）');
    }
    const res = await fetch(`${this.config.endpoint}?set=${set}`, { headers: this.config.headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { meta: { origin: this.name, endpoint: this.config.endpoint }, comps: this.config.mapToComps(await res.json()) };
  }
}

// 按优先级试，第一个成功的赢；全失败则抛出聚合错误，界面显示本地库兜底状态。
export async function createCompSource(providers, params) {
  const errors = [];
  for (const provider of providers) {
    try {
      const result = await provider.fetchComps(params);
      return { ...result, provider: provider.name, errors };
    } catch (e) {
      errors.push(`${provider.name}: ${e.message}`);
    }
  }
  throw new Error(errors.join(' | '));
}
