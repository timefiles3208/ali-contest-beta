const CDN = 'https://ddragon.leagueoflegends.com/cdn';

// DDragon 的棋子是整张精灵图(atlas)，缩放只能外层裁剪、内层 transform，
// 直接改 background-size 会把整张 atlas 一起缩掉。
export function iconHtml(unit, version, px = 48) {
  const direct = catalogIcon(unit?.icon);
  if (direct) return `<span class="ico-box" style="width:${px}px;height:${px}px"><img src="${direct}" width="${px}" height="${px}" loading="lazy" alt=""></span>`;
  const s = unit?.sprite;
  if (!s) return `<span class="ico-box" style="width:${px}px;height:${px}px"></span>`;
  const k = px / 48;
  return (
    `<span class="ico-box" style="width:${px}px;height:${px}px">` +
    `<i class="ico" style="transform:scale(${k.toFixed(3)});transform-origin:0 0;` +
    `background-image:url('${CDN}/${version}/img/sprite/${s.file}');` +
    `background-position:-${s.x}px -${s.y}px"></i></span>`
  );
}

export function catalogIcon(url) {
  if (typeof url !== 'string' || !/^https:\/\/(img\.dataj\.cc|game\.gtimg\.cn)\/[\w./%-]+$/i.test(url)) return null;
  return url;
}

export const loadJson = (path) =>
  fetch(path).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${path}`))));
