import { CATEGORY_COLORS } from './subjectColors';
import { CATEGORY_KEYS } from './rules';

// 教科と配点カテゴリの対応（backend/progress.py の SUBJECT_CATEGORY と同じ。片方を変えたらもう片方も直すこと）
// 教科は6つ（C-22）：math／sci／eng／jp（国語）／soc（地歴・公民）／essay（小論文・総合問題）。実技はなくした
// null は配点が無い教科（情報など）。EXPの倍率は1.0
export const SUBJECT_CATEGORY = {
  数学: 'math',
  物理: 'sci', 化学: 'sci', 生物: 'sci', 地学: 'sci',
  英語: 'eng',
  国語: 'jp', 現代文: 'jp', 古典: 'jp', 古文: 'jp', 漢文: 'jp',
  日本史: 'soc', 世界史: 'soc', 地理: 'soc',
  公民: 'soc', 倫理: 'soc', 政経: 'soc',
  '小論文・総合問題': 'essay', 小論文: 'essay', 総合問題: 'essay', 記述: 'essay',
  情報: null,
  理科: 'sci',
  '地歴・公民': 'soc',
};

/** 配点カテゴリの表示（6本。ホームのグラフとレポート）。色は subjectColors.js（C-3） */
export const CATEGORIES = [
  { id: 'math', label: '数学', color: CATEGORY_COLORS.math },
  { id: 'sci', label: '理科', color: CATEGORY_COLORS.sci },
  { id: 'eng', label: '英語', color: CATEGORY_COLORS.eng },
  { id: 'jp', label: '国語', color: CATEGORY_COLORS.jp },
  { id: 'soc', label: '地歴・公民', color: CATEGORY_COLORS.soc },
  { id: 'essay', label: '小論文', color: CATEGORY_COLORS.essay },
];

/** 記録画面・タイマーで選べる科目（docs/design/Record.dc.html） */
export const SUBJECT_GROUPS = [
  { category: 'math', label: '数学', items: ['数学', '情報'] },
  { category: 'sci', label: '理科', items: ['物理', '化学', '生物', '地学'] },
  { category: 'eng', label: '英語', items: ['英語'] },
  { category: 'jp', label: '国語', items: ['現代文', '古典'] },
  { category: 'soc', label: '地歴・公民', items: ['日本史', '世界史', '地理', '公民'] },
  { category: 'essay', label: '小論文', items: ['小論文・総合問題'] },
];
export const SUBJECT_LIST = SUBJECT_GROUPS.flatMap((g) => g.items);

const VALID = new Set(CATEGORY_KEYS);
const SOC_SUBJECTS = new Set(['日本史', '世界史', '地理', '公民', '倫理', '政経', '地歴・公民']);

/**
 * 記録のカテゴリを今の6教科で読む（移行の関数・C-22）
 * - 前の記録の jpsoc：日本史・世界史などの科目名なら soc、それ以外は jp
 * - カテゴリが書かれていない記録は科目名から決める（前の「実技」は小論文・総合問題）
 * - 情報など配点が無い科目は null
 */
export function categoryOfLog(log) {
  const c = log?.category;
  if (VALID.has(c)) return c;
  const subject = log?.subject;
  if (c === 'jpsoc') return SOC_SUBJECTS.has(subject) ? 'soc' : 'jp';
  if (subject === '実技') return 'essay';
  return SUBJECT_CATEGORY[subject] ?? null;
}

/** 今のシーズンの記録か（C-25：学年を変えたあとは、前のシーズンの記録を計算やグラフに入れない） */
export const inSeason = (log, profile) => (Number(log?.seasonId) || 0) === (Number(profile?.seasonId) || 0);
