// まるキャラを表示する部品。デザインのSVGをそのまま使う（Vite の import.meta.glob と ?raw）。
// 例：<Character uni="todai" stage={3} />  <Character uni="keio" stage={3} variant="equip" size={200} />
// uni は universities.js の id（todai / kagaku / chiba / keio / hitotsu / tufs / waseda / kyoto / osaka）
import './characters.css';

const files = import.meta.glob('./svg/*.svg', { query: '?raw', import: 'default', eager: true });
const svgOf = (name) => files[`./svg/${name}.svg`];

export function Character({ uni, stage, variant = 'normal', size = 160, still = false }) {
  const name = variant === 'equip' && stage === 3 ? `${uni}-equip` : `${uni}-${stage}`;
  const svg = svgOf(name);
  if (!svg) return null;
  return (
    <div
      className={still ? 'tama-char tama-still' : 'tama-char'}
      style={{ width: size, height: size }}
      // SVGはこのリポジトリ内の固定ファイルなので、そのまま埋め込んでよい
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
