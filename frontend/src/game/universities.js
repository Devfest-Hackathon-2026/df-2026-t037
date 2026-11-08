// 9大学・16学部のデータ（backend/universities.json と同じ内容）
// 9大学・16学部のデータ（デザイン「遊び方と数値ルール」「キャラクター案」と同じ値）
// 配点は2次（個別学力試験）の比率%。カテゴリは5つ：数学 / 理科 / 英語 / 国語・地歴公民 / 記述・実技
export const UNIVERSITIES = [
    { id: 'todai', name: '東京大学', short: '東大', character: 'ギンまる', stageNames: ['ギンまめ', 'ギンまる', 'ギンまる（金の葉）'], colors: ['#E6F1FC', '#9CC4EE', '#5F8FC8'], item: '銀杏の葉',
        equipLv3: { id: 'akamon-bag', name: '赤門のかばん', reason: '本郷の赤門（手に持つ）' }, equipLv5: { id: 'ginkgo-badge', name: '銀杏バッジ', reason: '銀杏並木' } },
    { id: 'kagaku', name: '東京科学大学', short: '科学大', character: 'チクまる', stageNames: ['チクまめ', 'チクまる', 'チクまる（時計台）'], colors: ['#FFF6E6', '#F6C88E', '#D08A4E'], item: '時計台',
        equipLv3: { id: 'labcoat', name: '白衣', reason: '理工系の実験室' }, equipLv5: { id: 'goggles', name: '実験ゴーグル', reason: '実験の安全装備' } },
    { id: 'chiba', name: '千葉工業大学', short: '千葉工大', character: 'キャタまる', stageNames: ['キャタまめ', 'キャタまる', 'キャタまる（レスキュー）'], colors: ['#EEFAE4', '#A8DA8C', '#5E9E4C'], item: 'レスキューロボ',
        equipLv3: { id: 'rescue-helmet', name: 'レスキューヘルメット', reason: '災害対応ロボットの研究' }, equipLv5: { id: 'probe-antenna', name: '探査アンテナ', reason: '惑星探査の研究' } },
    { id: 'keio', name: '慶應義塾大学', short: '慶應', character: 'ペンまる', stageNames: ['ペンまめ', 'ペンまる', 'ペンまる（紳士）'], colors: ['#8EA4DA', '#3E5698', '#1E2D5E'], item: '羽ペン',
        equipLv3: { id: 'fountain-pen', name: '万年筆', reason: '「ペンは剣よりも強し」' }, equipLv5: { id: 'red-bowtie', name: '赤い蝶ネクタイ', reason: '紳士の装い' } },
    { id: 'hitotsu', name: '一橋大学', short: '一橋', character: 'ハネまる', stageNames: ['ハネまめ', 'ハネまる', 'ハネまる（金の輪）'], colors: ['#FAF9FF', '#CFCBE6', '#8E88BA'], item: '翼と金の輪',
        equipLv3: { id: 'soroban', name: 'そろばん', reason: '商学から始まった歴史' }, equipLv5: { id: 'messenger-bag', name: '伝令のかばん', reason: '翼のある使者（手に持つ）' } },
    { id: 'tufs', name: '東京外国語大学', short: '東外大', character: 'コトまる', stageNames: ['コトまめ', 'コトまる', 'コトまる（旅人）'], colors: ['#EEFCF5', '#8EDDB8', '#3FA47A'], item: '言葉の吹き出し',
        equipLv3: { id: 'backpack', name: '旅のリュック', reason: '世界へ出かける' }, equipLv5: { id: 'globe', name: '地球儀', reason: 'たくさんの国と言葉' } },
    { id: 'waseda', name: '早稲田大学', short: '早稲田', character: 'ワセまる', stageNames: ['ワセまめ', 'ワセまる', 'ワセまる（バンカラ）'], colors: ['#FBE2E7', '#D27A8C', '#9A2A40'], item: '角帽とマント',
        equipLv3: { id: 'cheer-flag', name: '応援旗', reason: '早慶戦の応援' }, equipLv5: { id: 'megaphone', name: 'メガホン', reason: '応援団' } },
    { id: 'kyoto', name: '京都大学', short: '京大', character: 'ゲタまる', stageNames: ['ゲタまめ', 'ゲタまる', 'ゲタまる（羽織）'], colors: ['#F4F8E6', '#BCD08A', '#7A9444'], item: '丸メガネと下駄（自由の学風）',
        equipLv3: { id: 'wagasa', name: '和がさ', reason: '京都の町並み' }, equipLv5: { id: 'jiyu-fan', name: '「自由」のうちわ', reason: '自由の学風' } },
    { id: 'osaka', name: '大阪大学', short: '阪大', character: 'ワニまる', stageNames: ['ワニまめ', 'ワニまる', 'ワニまる（マチカネワニ）'], colors: ['#FFFAE6', '#F8DC86', '#D8A838'], item: 'マチカネワニのフード',
        equipLv3: { id: 'fossil-hammer', name: '化石のハンマー', reason: '待兼山で見つかった化石' }, equipLv5: { id: 'loupe', name: 'ルーペ', reason: '発掘と研究' } },
];
const W = (math, sci, eng, jpsoc, essay) => ({ math, sci, eng, jpsoc, essay });
// 東大の大学内補正＝科類の合格最低点÷6科類の平均（2026年度・550点満点・河合塾Kei-Net）
const TODAI_MIN = { b1: 325.01, b2: 330.47, b3: 316.32, r1: 303.39, r2: 305.0, r3: 346.09 };
const TODAI_MEAN = Object.values(TODAI_MIN).reduce((a, b) => a + b, 0) / 6;
const BUN = W(18, 0, 27, 55, 0), RI = W(27, 27, 27, 18, 0);
const todai = (id, name, w, ribbon) => ({
    id: `todai-${id}`, universityId: 'todai', name, subjects: 5, weights: w, uniFactor: TODAI_MIN[id] / TODAI_MEAN, minScore: TODAI_MIN[id], ribbon, source: 'Kei-Net 2026年度',
});
export const FACULTIES = [
    todai('b1', '文科一類', BUN, { color: '#2F4A7A', dark: '#1E3360', pin: 'scale', pinName: '天秤' }),
    todai('b2', '文科二類', BUN, { color: '#3FAE7A', dark: '#24804F', pin: 'bars', pinName: '棒グラフ' }),
    todai('b3', '文科三類', BUN, { color: '#F29AB4', dark: '#C8507A', pin: 'bookmark', pinName: 'しおり' }),
    todai('r1', '理科一類', RI, { color: '#5DB2EA', dark: '#2E7CB8', pin: 'ruler', pinName: '三角定規' }),
    todai('r2', '理科二類', RI, { color: '#8CCB5A', dark: '#4E8E28', pin: 'flask', pinName: 'フラスコ' }),
    todai('r3', '理科三類', RI, { color: '#F28C6B', dark: '#C25A3A', pin: 'stethoscope', pinName: '聴診器' }),
    { id: 'kagaku-eng', universityId: 'kagaku', name: '工学院', subjects: 4, weights: W(40, 40, 20, 0, 0), uniFactor: 1, ribbon: { color: '#F2A65A', dark: '#C87A2E', pin: 'wrench', pinName: 'スパナ' }, source: 'Kei-Net' },
    { id: 'chiba-adv', universityId: 'chiba', name: '先進工学部', subjects: 3, weights: W(33, 33, 34, 0, 0), uniFactor: 1, source: 'パスナビ（A日程）' },
    { id: 'keio-law', universityId: 'keio', name: '法学部', subjects: 3, weights: W(0, 0, 45, 33, 22), uniFactor: 1, source: 'Kei-Net（合格最低点は非公表のため補正1.00・要確認）' },
    { id: 'keio-sfc', universityId: 'keio', name: '環境情報学部', subjects: 2, weights: W(50, 0, 0, 0, 50), uniFactor: 1, source: 'Kei-Net（方式②）' },
    { id: 'hitotsu-soc', universityId: 'hitotsu', name: '社会学部', subjects: 4, weights: W(16, 0, 34, 50, 0), uniFactor: 1, source: 'Kei-Net' },
    { id: 'tufs-lang', universityId: 'tufs', name: '言語文化学部', subjects: 2, weights: W(0, 0, 67, 33, 0), uniFactor: 1, source: 'Kei-Net' },
    { id: 'waseda-pse', universityId: 'waseda', name: '政治経済学部', subjects: 5, weights: W(12, 0, 13, 25, 50), uniFactor: 1, source: 'Kei-Net（共テ選択は地歴として計算）' },
    { id: 'kyoto-law', universityId: 'kyoto', name: '法学部', subjects: 4, weights: W(25, 0, 33, 42, 0), uniFactor: 1, source: 'Kei-Net 2027年度前期（英200 数150 国150 地歴100）' },
    { id: 'kyoto-eng', universityId: 'kyoto', name: '工学部', subjects: 5, weights: W(31, 31, 25, 13, 0), uniFactor: 1, source: 'Kei-Net 2027年度前期（数250 理250 英200 国100）' },
    { id: 'osaka-eng', universityId: 'osaka', name: '工学部', subjects: 4, weights: W(36, 36, 28, 0, 0), uniFactor: 1, source: '2027年度前期（数250 理250 英200）' },
];
export const getUniversity = (id) => UNIVERSITIES.find(u => u.id === id);
export const getFaculty = (id) => FACULTIES.find(f => f.id === id);
