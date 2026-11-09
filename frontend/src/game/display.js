// 画面に出す値を作るための補助。数値の式そのものは rules.js にあり、ここでは組み合わせ方だけを決める
import {
  GRADE_HOURS, MILESTONES, makeSeason, standardHours, streakBonus, ymd,
} from './rules';

const DAY = 864e5;
export const STREAK_TIERS = [3, 7, 14, 30];

/** 今のアプリの学年表記 → ルールの学年（backend の GRADE_FROM_APP と同じ） */
export const GRADE_FROM_APP = { 高校1年生: '高1', 高校2年生: '高2', 高校3年生: '高3' };
export const APP_GRADES = Object.keys(GRADE_FROM_APP);

export const PACES = [
  { id: 'yuttari', label: 'ゆったり', note: '必要EXP×0.8', color: '#4E8E28', desc: '学年の目安の8割ほどで予定どおりに育つ' },
  { id: 'futsuu', label: 'ふつう', note: '×1.0', color: '#B07A10', desc: '学年の目安を毎日続けると予定どおりに育つ' },
  { id: 'gattsuri', label: 'がっつり', note: '×1.2・色違い', color: '#C8507A', desc: '目安より2割多く。最終進化が色違いになる' },
];

export const todayStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

/** 'YYYY-MM-DD' → 端末の時刻の Date（new Date('YYYY-MM-DD') はUTCになるので使わない） */
export function parseYmd(s) {
  if (typeof s !== 'string') return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

export const daysBetween = (a, b) => Math.round((b.getTime() - a.getTime()) / DAY);
export const addDays = (d, n) => new Date(d.getTime() + n * DAY);
export const jpDate = (d) => `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
export const jpMonthDay = (d) => `${d.getMonth() + 1}月${d.getDate()}日`;
/** 「12月上旬ごろ」 */
export const roughDate = (d) => `${d.getMonth() + 1}月${d.getDate() <= 10 ? '上旬' : d.getDate() <= 20 ? '中旬' : '下旬'}ごろ`;
/** 5.25 → 5.3、8 → 8 */
export const hoursLabel = (h) => String(Number(h.toFixed(1)));
export const round10 = (h) => Math.max(10, Math.round(h / 10) * 10);
export const comma = (n) => Math.round(n).toLocaleString('ja-JP');

/** 受験日の初期値：高3は次の2月25日、高2はその1年後、高1は2年後 */
export function defaultExamDate(appGrade, today = todayStart()) {
  const thisYear = new Date(today.getFullYear(), 1, 25);
  const nextFeb25Year = today < thisYear ? today.getFullYear() : today.getFullYear() + 1;
  const plus = { 高校3年生: 0, 高校2年生: 1, 高校1年生: 2 }[appGrade] ?? 0;
  return ymd(new Date(nextFeb25Year + plus, 1, 25));
}

/** 学年の目安の説明（「高2の目安は1日3.5時間（長期休みは5.3時間）」） */
export function gradeHoursText(grade) {
  const h = GRADE_HOURS[grade];
  if (grade === '高3') return `高3の目安は毎日${hoursLabel(h)}時間`;
  return `${grade}の目安は1日${hoursLabel(h)}時間（長期休みは${hoursLabel(h * 1.5)}時間）`;
}

/** 節目（1回目の進化・最終進化・親密度10）がシーズンの何日目か、その日付 */
export function milestoneDates(grade, start, examDate) {
  const season = makeSeason(grade, start, examDate);
  const L = season.days;
  const at = (days) => addDays(season.start, Math.ceil(days));
  return {
    season,
    first: at(Math.min(MILESTONES.first * L, MILESTONES.firstMaxDays)),
    final: at(MILESTONES.final * L),
    bond10: at(MILESTONES.bond10 * L),
  };
}

/** 次にめざす節目と、そこまでのEXP */
export function nextGoal(exp, plan) {
  const e = plan.exp;
  if (exp < e.first) return { label: '1回目の進化まで', target: e.first };
  if (exp < e.final) return { label: '最終進化まで', target: e.final };
  const step = (e.bond10 - e.final) / 10;
  const bond = Math.min(10, Math.floor((exp - e.final) / step));
  if (bond >= 10) return null;
  return { label: `親密度${bond + 1}まで`, target: Math.round(e.final + step * (bond + 1)) };
}

/** 連続日数のボーナス表示（「×1.05」「明日で×1.10」） */
export function streakInfo(streak) {
  const bonus = streakBonus(streak);
  const next = STREAK_TIERS.find((t) => t > streak);
  let hint = '最大ボーナス';
  if (next) {
    const left = next - streak;
    hint = left === 1 ? `明日で×${streakBonus(next).toFixed(2)}` : `あと${left}日で×${streakBonus(next).toFixed(2)}`;
  }
  return { bonus: `×${bonus.toFixed(2)}`, hint };
}

/** 今日の学年の目安（時間） */
export const todayHours = (grade) => standardHours(grade, todayStart());

/** 年度（4月はじまり） */
const fiscalYearOf = (d) => (d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1);

/**
 * 起動のときに進級の確認（POST /season/check）が要るか（C-9）。
 * シーズンが終わっている、または年度が変わっている（つないだシーズンの途中で4月をこえた）ときだけ true
 */
export function seasonCheckDue(profile, today = todayStart()) {
  const plan = profile?.plan;
  if (!plan || profile?.seasonEnded) return false;
  const start = parseYmd(plan.seasonStart);
  const end = parseYmd(plan.seasonEnd);
  if (!start || !end) return false;
  return today > end || fiscalYearOf(today) > fiscalYearOf(start);
}
