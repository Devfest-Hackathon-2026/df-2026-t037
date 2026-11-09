// 教科の色（C-3）。教科は6つ（C-22）。ホームのグラフ・記録画面のチップ・タイマー・レポートは、すべてここの色を使う
// ピンクと赤の上に白い文字をのせるときは、太字14px以上にする
export const CATEGORY_COLORS = {
  math: '#2563C9', // 数学：青
  sci: '#2E9E6A', // 理科：緑
  eng: '#E0558E', // 英語：ピンク
  jp: '#D64545', // 国語：赤
  soc: '#D9822B', // 地歴・公民：オレンジ
  essay: '#8A63CF', // 小論文・総合問題：むらさき
};

// 科目ごとに細かく分けるとき（記録画面のチップ）
export const SUBJECT_COLORS = {
  数学: '#2563C9', 情報: '#1C8FA0',
  物理: '#2E9E6A', 化学: '#2E9E6A', 生物: '#2E9E6A', 地学: '#2E9E6A',
  英語: '#E0558E',
  現代文: '#D64545', 古典: '#D64545',
  日本史: '#D9822B', 世界史: '#D9822B', 地理: '#D9822B', 公民: '#D9822B',
  '小論文・総合問題': '#8A63CF',
};

/** 科目の色。細かい色がない科目（前の記録の「国語」「理科」など）はカテゴリの色にする */
export function colorOfSubject(subject, category) {
  return SUBJECT_COLORS[subject] || CATEGORY_COLORS[category] || '#8A7A72';
}
