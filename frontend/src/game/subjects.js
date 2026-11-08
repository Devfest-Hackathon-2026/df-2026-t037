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

/** 配点カテゴリの表示（Launch.dc.html の色） */
export const CATEGORIES = [
  { id: 'math', label: '数学', color: '#2468B8' },
  { id: 'sci', label: '理科', color: '#3A8DDE' },
  { id: 'eng', label: '英語', color: '#7240B8' },
  { id: 'jpsoc', label: '国地', color: '#A07BE0' },
  { id: 'essay', label: '記実', color: '#B8461C' },
];
