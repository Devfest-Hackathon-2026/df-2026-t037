// まるキャラを表示する部品。デザインのSVGをそのまま使う（Vite の import.meta.glob と ?raw）。
// 例：<Character uni="todai" stage={3} />  <Character uni="keio" stage={3} variant="equip" size={200} faculty={faculty} />
// uni は universities.js の id（todai / kagaku / chiba / keio / hitotsu / tufs / waseda / kyoto / osaka）
import './characters.css';
import { withWear } from './wear';

const files = import.meta.glob('./svg/*.svg', { query: '?raw', import: 'default', eager: true });
const pinFiles = import.meta.glob('./pins/*.svg', { query: '?raw', import: 'default', eager: true });
const svgOf = (name) => files[`./svg/${name}.svg`];

// 前の学部データのピン名 → pins/ のファイル名
const PIN_ALIAS = { scale: 'tenbin', bars: 'graph', bookmark: 'shiori', ruler: 'jougi', stethoscope: 'choushin', wrench: 'spanner' };

// リボンの位置（docs/design/Gakubu.dc.html）。千葉工大だけ頭の形がちがうので位置をずらす
const RIBBON_AT = { chiba: 'translate(58 47) rotate(-25) scale(.9)' };
const RIBBON_DEFAULT = 'translate(46 56) rotate(-40) scale(.9)';

const isColor = (c) => typeof c === 'string' && /^#[0-9A-Fa-f]{3,8}$/.test(c);

/** pins/{name}.svg の中身（外側の <svg> を外したもの）。中心が (0,0)・半径13の白い丸つき */
function pinInner(pin) {
  const raw = pinFiles[`./pins/${PIN_ALIAS[pin] || pin}.svg`];
  if (!raw) {
    // ピンの絵が足りないと、最終進化でリボンだけになる。開発中に気づけるよう警告を出す
    if (import.meta.env.DEV && pin) console.warn(`[Character] pins/${PIN_ALIAS[pin] || pin}.svg がありません`);
    return '';
  }
  return raw.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
}

/**
 * 最終進化に学部のリボン（頭の左上）とピン（胸の右下 106,124）を重ねる。
 * アニメーションのついたグループ（spinM・sway・flap など）の中に入れると一緒に回ってしまうので（C-7）、
 * </svg> の直前に、アニメーションなしの <g> として足す
 */
function withFacultyMarks(svg, uni, ribbon) {
  if (!ribbon || !isColor(ribbon.color) || !isColor(ribbon.dark)) return svg;
  const bow =
    `<g transform="${RIBBON_AT[uni] || RIBBON_DEFAULT}">` +
    `<path d="M0 0 L-13 -7 L-13 7 Z M0 0 L13 -7 L13 7 Z" fill="${ribbon.color}"></path>` +
    `<circle r="3.4" fill="${ribbon.dark}"></circle></g>`;
  const pin = pinInner(ribbon.pin);
  const marks = `<g class="tama-faculty-marks">${bow}${pin ? `<g transform="translate(106 124)">${pin}</g>` : ''}</g>`;
  const end = svg.lastIndexOf('</svg>');
  return end < 0 ? svg : svg.slice(0, end) + marks + svg.slice(end);
}

/** wear：着替えの装備（{ head, neck, chest, hand, back, effect }）。レジェンド・ミシック・メダル・エフェクトを絵に重ねる */
export function Character({ uni, stage, variant = 'normal', size = 160, still = false, faculty = null, wear = null }) {
  const name = variant === 'equip' && stage === 3 ? `${uni}-equip` : `${uni}-${stage}`;
  const base = svgOf(name);
  if (!base) return null;
  const worn = wear ? withWear(base, wear) : base;
  const svg = stage === 3 ? withFacultyMarks(worn, uni, faculty?.ribbon) : worn;
  return (
    <div
      className={still ? 'tama-char tama-still' : 'tama-char'}
      style={{ width: size, height: size }}
      // SVGはこのリポジトリ内の固定ファイル（リボンの色は16進数の色だけを通す）なので、そのまま埋め込んでよい
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** ミシック（最上級エフェクト）の見本：phoenix / aurora / sakura */
export function MythicPreview({ id, size = 190 }) {
  return <div className="tama-char" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svgOf(`mythic-${id}`) }} />;
}

/** ログイン・初期設定のたまご */
export function Egg({ size = 200 }) {
  return <div className="tama-char" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svgOf('egg') }} />;
}
