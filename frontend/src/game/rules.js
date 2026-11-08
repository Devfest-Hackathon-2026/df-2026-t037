// 進路たまごっち（仮）の数値ルール（デザイン「遊び方と数値ルール」「学年シーズンと図鑑」と同じ計算）
// サーバー（backend/game_rules.py）と同じ式。片方を変えたらもう片方も直すこと
/** 学年ごとの1日の目安（時間）。高3は受験学年なので残り日数に関係なく毎日8時間 */
export const GRADE_HOURS = { 高1: 2.5, 高2: 3.5, 高3: 8 };
export const EXAM_GRADES = ['高3'];
/** ペース：必要EXPに掛ける。がっつりは最終進化が色違い */
export const PACE_FACTOR = { yuttari: 0.8, futsuu: 1.0, gattsuri: 1.2 };
/** 継続補正：連続ボーナスをもらいながら毎日続けた人がちょうど予定どおりに育つように */
export const CONTINUITY = 1.15;
/** 節目：シーズンの10%（最長30日）で1回目、45%で最終進化、85%で親密度10 */
export const MILESTONES = { first: 0.1, firstMaxDays: 30, final: 0.45, bond10: 0.85 };
/** 残り60日未満で始めたら次の学年のシーズンとつなげる（受験学年は除く） */
export const MIN_SEASON_DAYS = 60;
const DAY = 864e5;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getTime() + n * DAY);
const diffDays = (a, b) => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY);
/** 端末の時刻のまま YYYY-MM-DD にする（toISOStringだと日本時間で1日ずれるため） */
export const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** 夏（7/21〜8/31）・冬（12/25〜1/7）・春（3/25〜4/7）休み */
export function isLongVacation(d) {
    const m = d.getMonth() + 1, day = d.getDate();
    return (m === 7 && day >= 21) || m === 8 || (m === 12 && day >= 25) || (m === 1 && day <= 7) || (m === 3 && day >= 25) || (m === 4 && day <= 7);
}
/** その日の学年の目安（時間）。受験学年以外は長期休みに1.5倍 */
export function standardHours(grade, d) {
    if (EXAM_GRADES.includes(grade))
        return GRADE_HOURS[grade];
    return GRADE_HOURS[grade] * (isLongVacation(d) ? 1.5 : 1);
}
const nextGrade = (g) => (g === '高1' ? '高2' : '高3');
/** その日付の学年度末（3月31日） */
const fiscalYearEnd = (d) => new Date(d.getMonth() >= 3 ? d.getFullYear() + 1 : d.getFullYear(), 2, 31);
/** シーズン：受験しない学年は3月31日まで、受験学年は受験日まで。60日未満なら次の学年とつなぐ */
export function makeSeason(grade, start, examDate) {
    const s = startOfDay(start);
    if (EXAM_GRADES.includes(grade)) {
        return { start: s, end: startOfDay(examDate), days: diffDays(s, examDate), gradeOn: () => grade };
    }
    let end = fiscalYearEnd(s);
    let joined = false;
    if (diffDays(s, end) < MIN_SEASON_DAYS) {
        joined = true;
        const ng = nextGrade(grade);
        end = EXAM_GRADES.includes(ng) ? startOfDay(examDate) : fiscalYearEnd(addDays(end, 1));
    }
    const boundary = addDays(fiscalYearEnd(s), 1); // 4月1日
    return {
        start: s, end, days: diffDays(s, end),
        gradeOn: d => (joined && d >= boundary ? nextGrade(grade) : grade),
    };
}
/** 配点どおりに勉強したときの1分あたりEXP（例：科学大 工学院 1.36） */
export const averageMultiplier = (w) => 1 + Object.values(w).reduce((a, v) => a + (v / 100) ** 2, 0);
/** 学部補正＝科目数（4科目で1.00、±5%/科目）×記述・実技（比率×15%）×大学内補正。幅は0.90〜1.16 */
export const facultyFactor = (f) => (1 + 0.05 * (f.subjects - 4)) * (1 + 0.15 * f.weights.essay / 100) * f.uniFactor;
/** シーズンのはじめ（初期設定・4月1日の進級・志望変更）に1回だけ計算して保存する */
export function makePlan(args) {
    const season = makeSeason(args.grade, args.start, args.examDate);
    const L = season.days;
    const t = { first: Math.min(MILESTONES.first * L, MILESTONES.firstMaxDays), final: MILESTONES.final * L, bond10: MILESTONES.bond10 * L };
    const sumHours = (days) => {
        let h = 0;
        for (let i = 0; i < days; i++) {
            const d = addDays(season.start, i);
            h += standardHours(season.gradeOn(d), d);
        }
        return h;
    };
    const hours = { first: sumHours(t.first), final: sumHours(t.final), bond10: sumHours(t.bond10) };
    const k = 60 * averageMultiplier(args.faculty.weights) * facultyFactor(args.faculty) * CONTINUITY * PACE_FACTOR[args.pace];
    const r100 = (v) => Math.round(v / 100) * 100;
    return {
        seasonStart: ymd(season.start),
        seasonEnd: ymd(season.end),
        hours,
        exp: { first: r100(hours.first * k), final: r100(hours.final * k), bond10: r100(hours.bond10 * k) },
    };
}
/** 連続日数ボーナス：3日×1.05／7日×1.10／14日×1.15／30日×1.20 */
export function streakBonus(streak) {
    return streak >= 30 ? 1.2 : streak >= 14 ? 1.15 : streak >= 7 ? 1.1 : streak >= 3 ? 1.05 : 1;
}
/** 「続けた日」になる1日の最低分数＝学年の目安の1/4（高1は約38分、高3は120分） */
export const streakThresholdMinutes = (grade) => Math.round(GRADE_HOURS[grade] * 60 / 4);
/**
 * 翌朝の定期実行で使う：前日に「続けた日」でなければ、
 * その週のおやすみ券が残っていれば連続を保ち、なければ半分にする（0には戻さない）
 */
export function nextStreak(prev, studiedYesterday, ticketLeftThisWeek) {
    if (studiedYesterday)
        return { streak: prev, usedTicket: false };
    if (ticketLeftThisWeek)
        return { streak: prev, usedTicket: true };
    return { streak: Math.floor(prev / 2), usedTicket: false };
}
/** 記録1件のEXP＝分数×（1＋その教科の配点比率）×連続ボーナス。配点に無いカテゴリ（情報など）は0%として扱う */
export function expForLog(minutes, category, weights, streak) {
    return Math.round(minutes * (1 + (weights[category] ?? 0) / 100) * streakBonus(streak));
}
export const stageOf = (exp, plan) => (exp >= plan.exp.final ? 3 : exp >= plan.exp.first ? 2 : 1);
/** 親密度1つ＝（親密度10の必要EXP−最終進化の必要EXP）÷10。最大10 */
export function bondOf(exp, plan) {
    if (exp < plan.exp.final)
        return 0;
    const step = (plan.exp.bond10 - plan.exp.final) / 10;
    return Math.min(10, Math.floor((exp - plan.exp.final) / step));
}
/** 親密度で解放されるもの */
export const BOND_UNLOCKS = { 3: '大学の装備1', 5: '大学の装備2', 7: 'かっこいい姿', 10: '大のなかよし' };
/** 画面の「あと約◯時間（1日◯時間なら約◯日）」 */
export function timeToGo(expLeft, faculty, streak, grade, today = new Date()) {
    const perHour = 60 * averageMultiplier(faculty.weights) * streakBonus(streak);
    const hours = Math.max(0, expLeft) / perHour;
    const daily = standardHours(grade, today);
    return { hours: Math.round(hours), days: Math.ceil(hours / daily) };
}
/** 上限なしのアイテムのしきい値 */
export const ENDLESS = {
    subjectMasterMinutes: 3000, // 教科カテゴリごと累計3,000分（50時間）で★1。★5ごとに色が変わる
    medalExp: 50000, // 累計5万EXPごとに記念メダル（銅→銀→金→虹）
    omiyageExp: 2000, // 親密度10のあと2,000EXPごとにおみやげ（大学ごと12種）
    seasonalRatio: 0.5, // その月に学年の目安の半分をこえると季節の着せかえ
    streakTitles: [7, 30, 100], // 以降100日ごと
};
/** レジェンド装備（全大学共通・とても難しい） */
export const LEGEND = [
    { id: 'a-crown', name: 'A判定の王冠', slot: 'head', condition: '志望校の模試でA判定' },
    { id: 'comeback-wings', name: '逆転の翼', slot: 'back', condition: '同じ模試シリーズで判定を2段階以上アップ' },
    { id: 'star70', name: '偏差値70の星章', slot: 'chest', condition: '模試の総合偏差値70以上' },
    { id: 'meteor', name: '流れ星', slot: 'effect', condition: '模試の1教科で全国上位1%' },
    { id: 'sun-aura', name: '太陽のオーラ', slot: 'effect', condition: '365日連続で記録（おやすみ券は使ってよい）' },
];
/** ミシック（最上級エフェクト） */
export const MYTHIC = [
    { id: 'phoenix', name: '不死鳥の炎', condition: '同じ模試シリーズで志望校の判定をE→Aまで上げる' },
    { id: 'aurora', name: '銀河のオーロラ', condition: '高1・高2・高3の3シーズンすべてで親密度10（がっつりペース）' },
    { id: 'sakura', name: '満開の桜吹雪', condition: '志望校に合格する（合格通知をGeminiで確認）' },
];
/** 着替え：場所ごとに1つ＋エフェクト1つ。勉強タイマー中は変更できない */
export const SLOTS = ['head', 'neck', 'chest', 'hand', 'back', 'effect'];
export const canChangeOutfit = (timerStartedAt) => timerStartedAt === null;
