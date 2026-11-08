import { CATEGORY_COLORS } from './subjectColors';

// 教科と配点カテゴリの対応（backend/progress.py の SUBJECT_CATEGORY と同じ。片方を変えたらもう片方も直すこと）
// null は配点が無い教科（情報など）。EXPの倍率は1.0
export const SUBJECT_CATEGORY = {
  数学: 'math',
  物理: 'sci', 化学: 'sci', 生物: 'sci', 地学: 'sci',
  英語: 'eng',
  国語: 'jpsoc', 現代文: 'jpsoc', 古典: 'jpsoc', 古文: 'jpsoc', 漢文: 'jpsoc',
  日本史: 'jpsoc', 世界史: 'jpsoc', 地理: 'jpsoc',
  公民: 'jpsoc', 倫理: 'jpsoc', 政経: 'jpsoc',
  小論文: 'essay', 総合問題: 'essay', 記述: 'essay', 実技: 'essay',
  情報: null,
  理科: 'sci',
  '地歴・公民': 'jpsoc',
};

/** 配点カテゴリの表示。色は subjectColors.js（C-3）にまとめてある */
export const CATEGORIES = [
  { id: 'math', label: '数学', color: CATEGORY_COLORS.math },
  { id: 'sci', label: '理科', color: CATEGORY_COLORS.sci },
  { id: 'eng', label: '英語', color: CATEGORY_COLORS.eng },
  { id: 'jpsoc', label: '国語・地歴', color: CATEGORY_COLORS.jpsoc },
  { id: 'essay', label: '記述', color: CATEGORY_COLORS.essay },
];

/** 記録画面・タイマーで選べる科目（docs/design/Henkou.dc.html ②） */
export const SUBJECT_GROUPS = [
  { category: 'math', label: '数学', items: ['数学', '情報'] },
  { category: 'sci', label: '理科', items: ['物理', '化学', '生物'] },
  { category: 'eng', label: '英語', items: ['英語'] },
  { category: 'jpsoc', label: '国語・地歴', items: ['現代文', '古典', '日本史', '世界史'] },
  { category: 'essay', label: '記述', items: ['小論文', '実技'] },
];
export const SUBJECT_LIST = SUBJECT_GROUPS.flatMap((g) => g.items);
