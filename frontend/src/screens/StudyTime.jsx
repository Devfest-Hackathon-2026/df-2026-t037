// 勉強時間の変遷（スマホのスクリーンタイムのような日ごとの棒グラフ）
// 教科の色で積み上げ・点線は1日平均。棒を押すとその日の内訳が出る。学年を変える前の記録も時間としてそのまま数える
import { useMemo, useState } from "react";
import { CATEGORIES, categoryOfLog } from "../game/subjects";
import { colorOfSubject } from "../game/subjectColors";

const DAY_MS = 24 * 60 * 60 * 1000;
// 配点の6教科に入らない記録（情報など）。色は教科のバランスの「情報」と同じ
const OTHER = { id: "other", label: "情報など", color: colorOfSubject("情報", null) };
const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

const fmt = (min) => {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  return h === 0 ? `${m}分` : m % 60 === 0 ? `${h}時間` : `${h}時間${m % 60}分`;
};
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export default function StudyTime({ logs, days }) {
  const [picked, setPicked] = useState(null);

  const data = useMemo(() => {
    const today = startOfDay(new Date());
    const bucket = (offset) => {
      const date = new Date(today.getTime() - offset * DAY_MS);
      return { date, total: 0, parts: Object.fromEntries([...CATEGORIES, OTHER].map((c) => [c.id, 0])) };
    };
    const cur = Array.from({ length: days }, (_, i) => bucket(days - 1 - i));
    let prevTotal = 0;
    for (const l of logs || []) {
      if (!l.dateObj) continue;
      const diff = Math.floor((today.getTime() - startOfDay(l.dateObj).getTime()) / DAY_MS);
      const min = Number(l.minutes) || 0;
      if (diff >= 0 && diff < days) {
        const b = cur[days - 1 - diff];
        const cat = categoryOfLog(l);
        b.parts[cat && b.parts[cat] !== undefined ? cat : "other"] += min;
        b.total += min;
      } else if (diff >= days && diff < days * 2) {
        prevTotal += min;
      }
    }
    const total = cur.reduce((s, b) => s + b.total, 0);
    const avg = total / days;
    const max = Math.max(60, ...cur.map((b) => b.total), avg);
    // 目盛りは30分・1時間・2時間…のきりのいい数
    const unit = [30, 60, 120, 180, 240, 360, 480].find((u) => max / u <= 4) || 600;
    const top = Math.ceil(max / unit) * unit;
    // 前の同じ期間と比べる（読み込んでいる記録は30日分なので、7日のときだけ）
    const canCompare = days * 2 <= 30;
    const change = canCompare && prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null;
    return { cur, total, avg, top, unit, change, canCompare, prevTotal };
  }, [logs, days]);

  const sel = picked != null ? data.cur[picked] : null;
  const ticks = Array.from({ length: Math.round(data.top / data.unit) + 1 }, (_, i) => i * data.unit);

  return (
    <div className="stime">
      <div className="stime-head">
        <div>
          <p className="stime-kicker"><span>{sel ? `${sel.date.getMonth() + 1}月${sel.date.getDate()}日（${WEEK[sel.date.getDay()]}）` : "1日の平均"}</span></p>
          <p className="stime-big"><span>{fmt(sel ? sel.total : data.avg)}</span></p>
        </div>
        {!sel && data.change !== null && (
          <p className={`stime-change ${data.change >= 0 ? "up" : "down"}`}>
            <span>{`${data.change >= 0 ? "▲" : "▼"} 前の${days}日より${Math.abs(data.change)}%${data.change >= 0 ? "増" : "減"}`}</span>
          </p>
        )}
        {!sel && data.canCompare && data.change === null && data.total > 0 && (
          <p className="stime-change"><span>{`前の${days}日は記録なし`}</span></p>
        )}
      </div>

      <div className="stime-chart" role="img" aria-label={`直近${days}日の日ごとの勉強時間。1日平均${fmt(data.avg)}`}>
        <div className="stime-grid">
          {ticks.map((t) => (
            <div key={t} className="stime-tick" style={{ bottom: `${(t / data.top) * 100}%` }}>
              <span>{t === 0 ? "0" : t % 60 === 0 ? `${t / 60}時間` : `${t}分`}</span>
            </div>
          ))}
          {data.avg > 0 && (
            <div className="stime-avg" style={{ bottom: `${(data.avg / data.top) * 100}%` }}>
              <span>平均</span>
            </div>
          )}
        </div>
        <div className={`stime-bars ${days > 7 ? "many" : ""}`}>
          {data.cur.map((b, i) => (
            <button
              key={b.date.getTime()}
              type="button"
              className={`stime-bar ${picked === i ? "on" : ""} ${picked != null && picked !== i ? "dim" : ""}`}
              onClick={() => setPicked(picked === i ? null : i)}
              aria-label={`${b.date.getMonth() + 1}月${b.date.getDate()}日 ${fmt(b.total)}`}
            >
              <span className="stime-stack" style={{ height: `${(b.total / data.top) * 100}%` }}>
                {[...CATEGORIES, OTHER].filter((c) => b.parts[c.id] > 0).map((c) => (
                  <span key={c.id} style={{ flexGrow: b.parts[c.id], background: c.color }} />
                ))}
              </span>
              <span className={`stime-day ${i === days - 1 ? "last" : ""}`}>
                {days <= 7 ? WEEK[b.date.getDay()] : (days - 1 - i) % 7 === 0 ? `${b.date.getMonth() + 1}/${b.date.getDate()}` : ""}
              </span>
            </button>
          ))}
        </div>
      </div>

      {sel ? (
        <ul className="stime-detail">
          {[...CATEGORIES, OTHER].filter((c) => sel.parts[c.id] > 0).map((c) => (
            <li key={c.id}>
              <span className="dot" style={{ background: c.color }} />
              <span>{c.label}</span>
              <strong>{fmt(sel.parts[c.id])}</strong>
            </li>
          ))}
          {sel.total === 0 && <li className="stime-none"><span>この日の記録はありません</span></li>}
        </ul>
      ) : (
        <p className="stime-foot"><span>{`直近${days}日の合計 ${fmt(data.total)}｜棒を押すとその日の内訳`}</span></p>
      )}
    </div>
  );
}
