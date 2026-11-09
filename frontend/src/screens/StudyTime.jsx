// 勉強時間の変遷（スマホのスクリーンタイムのように「日・週・月」を切り替える1つの棒グラフ）
// 日：1時間ごと（記録した時刻から勉強した分だけさかのぼって割りふる）／週：7日／月：カレンダーの1か月
// 教科の色で積み上げ・点線は平均。‹ › で前の日・週・月へ。週・月は前の期間と1日平均を比べた増減を出す
// 表示している期間（と比べる前の期間）の記録だけを、このグラフが自分で読み込む
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query, where, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import { CATEGORIES, categoryOfLog } from "../game/subjects";
import { colorOfSubject } from "../game/subjectColors";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
// 配点の6教科に入らない記録（情報など）。色は教科のバランスの「情報」と同じ
const OTHER = { id: "other", label: "情報など", color: colorOfSubject("情報", null) };
const KINDS = [...CATEGORIES, OTHER];
const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
const MODES = [
  { id: "day", label: "日" },
  { id: "week", label: "週" },
  { id: "month", label: "月" },
];
// さかのぼれる上限（日：1年・週：1年・月：2年）
const MAX_BACK = { day: 365, week: 52, month: 24 };

const fmt = (min) => {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  return h === 0 ? `${m}分` : m % 60 === 0 ? `${h}時間` : `${h}時間${m % 60}分`;
};
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const md = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
const emptyBar = (key, start, end) => ({ key, start, end, total: 0, parts: Object.fromEntries(KINDS.map((c) => [c.id, 0])) });
const kindOf = (l) => {
  const c = categoryOfLog(l);
  return c && CATEGORIES.some((x) => x.id === c) ? c : "other";
};

/** 記録を「終わった時刻（createdAt）から minutes 分さかのぼった時間帯」として、棒の区切りに割りふる */
function fill(bars, logs) {
  for (const l of logs || []) {
    if (!l.dateObj) continue;
    const min = Number(l.minutes) || 0;
    if (min <= 0) continue;
    const end = l.dateObj.getTime();
    const start = end - min * 60000;
    const k = kindOf(l);
    for (const b of bars) {
      const overlap = Math.min(end, b.end) - Math.max(start, b.start);
      if (overlap > 0) {
        const m = overlap / 60000;
        b.parts[k] += m;
        b.total += m;
      }
    }
  }
}

/** 表示する棒の区切りと、比べる前の期間（日は前の期間なし） */
function periodOf(mode, back) {
  const today = startOfDay(new Date());
  if (mode === "day") {
    const day = new Date(today.getTime() - back * DAY_MS);
    const bars = Array.from({ length: 24 }, (_, h) => emptyBar(h, day.getTime() + h * HOUR_MS, day.getTime() + (h + 1) * HOUR_MS));
    const title = back === 0 ? "今日" : back === 1 ? "きのう" : `${day.getMonth() + 1}月${day.getDate()}日（${WEEK[day.getDay()]}）`;
    return { bars, prev: null, title, days: 1 };
  }
  if (mode === "week") {
    const last = today.getTime() - back * 7 * DAY_MS;
    const bars = Array.from({ length: 7 }, (_, i) => {
      const st = last - (6 - i) * DAY_MS;
      return emptyBar(i, st, st + DAY_MS);
    });
    const prev = emptyBar("prev", bars[0].start - 7 * DAY_MS, bars[0].start);
    const title = back === 0 ? "直近7日" : `${md(new Date(bars[0].start))}〜${md(new Date(bars[6].start))}`;
    return { bars, prev, title, days: 7, prevDays: 7 };
  }
  // 月：カレンダーの1か月。今月はきょうまでの日数で平均する
  const first = new Date(today.getFullYear(), today.getMonth() - back, 1);
  const n = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const bars = Array.from({ length: n }, (_, i) => {
    const st = new Date(first.getFullYear(), first.getMonth(), i + 1).getTime();
    return emptyBar(i, st, st + DAY_MS);
  });
  const prevFirst = new Date(first.getFullYear(), first.getMonth() - 1, 1);
  const prevDays = new Date(prevFirst.getFullYear(), prevFirst.getMonth() + 1, 0).getDate();
  const prev = emptyBar("prev", prevFirst.getTime(), first.getTime());
  const days = back === 0 ? today.getDate() : n;
  const title = `${first.getFullYear()}年${first.getMonth() + 1}月${back === 0 ? "（今月）" : ""}`;
  return { bars, prev, title, days, prevDays };
}

export default function StudyTime({ uid }) {
  const [mode, setMode] = useState("week");
  const [back, setBack] = useState(0);
  const [picked, setPicked] = useState(null);
  const [loaded, setLoaded] = useState({ key: "", logs: [] });

  const period = useMemo(() => periodOf(mode, back), [mode, back]);
  const rangeStart = (period.prev || period.bars[0]).start;
  const rangeEnd = period.bars[period.bars.length - 1].end;
  const rangeKey = `${uid}:${rangeStart}:${rangeEnd}`;

  // 表示する期間と前の期間の記録を読み込む（長い勉強が前の日にまたがる分も入るよう、6時間前から）
  useEffect(() => {
    if (!uid) return undefined;
    const q = query(
      collection(db, "users", uid, "study_logs"),
      where("createdAt", ">=", Timestamp.fromDate(new Date(rangeStart))),
      where("createdAt", "<", Timestamp.fromDate(new Date(rangeEnd + 6 * HOUR_MS))),
      orderBy("createdAt", "asc")
    );
    return onSnapshot(
      q,
      (snap) =>
        setLoaded({
          key: rangeKey,
          logs: snap.docs.map((d) => {
            const x = d.data();
            return { ...x, dateObj: x.createdAt?.toDate ? x.createdAt.toDate() : null };
          }),
        }),
      (err) => console.error("[study time]", err)
    );
  }, [uid, rangeStart, rangeEnd, rangeKey]);

  const ready = loaded.key === rangeKey;
  const data = useMemo(() => {
    const bars = period.bars.map((b) => emptyBar(b.key, b.start, b.end));
    const prev = period.prev ? emptyBar("prev", period.prev.start, period.prev.end) : null;
    if (ready) fill(prev ? [...bars, prev] : bars, loaded.logs);
    const total = bars.reduce((sum, b) => sum + b.total, 0);
    const avg = mode === "day" ? null : total / period.days;
    const prevAvg = prev ? prev.total / period.prevDays : 0;
    const change = prev && prevAvg > 0 ? Math.round(((avg - prevAvg) / prevAvg) * 100) : null;
    const max = Math.max(mode === "day" ? 30 : 60, ...bars.map((b) => b.total), avg || 0);
    const unit = mode === "day" ? (max <= 30 ? 15 : 30) : [30, 60, 120, 180, 240, 360, 480].find((u) => max / u <= 4) || 600;
    const top = Math.ceil(max / unit) * unit;
    return { bars, total, avg, change, top, unit, title: period.title, hasPrev: Boolean(prev) };
  }, [period, loaded, ready, mode]);

  const switchMode = (m) => {
    setMode(m);
    setBack(0);
    setPicked(null);
  };
  const go = (d) => {
    setBack((b) => Math.max(0, Math.min(MAX_BACK[mode], b + d)));
    setPicked(null);
  };

  const sel = picked != null ? data.bars[picked] : null;
  const selLabel = sel
    ? mode === "day"
      ? `${sel.key}時台`
      : `${md(new Date(sel.start))}（${WEEK[new Date(sel.start).getDay()]}）`
    : null;
  const ticks = Array.from({ length: Math.round(data.top / data.unit) + 1 }, (_, i) => i * data.unit);
  const tickLabel = (t) => (t === 0 ? "0" : t % 60 === 0 ? `${t / 60}時間` : `${t}分`);
  const barLabel = (b, i) => {
    if (mode === "day") return i % 6 === 0 ? `${i}時` : "";
    const d = new Date(b.start);
    if (mode === "week") return WEEK[d.getDay()];
    return i % 7 === 0 ? `${d.getDate()}日` : "";
  };

  return (
    <div className="stime">
      <div className="segmented stime-modes" role="tablist" aria-label="グラフの期間">
        {MODES.map((m) => (
          <button key={m.id} type="button" role="tab" aria-selected={mode === m.id} className={mode === m.id ? "active" : ""} onClick={() => switchMode(m.id)}>
            <span>{m.label}</span>
          </button>
        ))}
      </div>

      <div className="stime-nav">
        <button type="button" className="stime-arrow" onClick={() => go(1)} disabled={back >= MAX_BACK[mode]} aria-label="前へ"><span>‹</span></button>
        <span className="stime-title">{data.title}</span>
        <button type="button" className="stime-arrow" onClick={() => go(-1)} disabled={back === 0} aria-label="次へ"><span>›</span></button>
      </div>

      <div className="stime-head">
        <div>
          <p className="stime-kicker"><span>{sel ? selLabel : mode === "day" ? "この日の合計" : mode === "month" && back === 0 ? "1日の平均（今月はきょうまで）" : "1日の平均"}</span></p>
          <p className="stime-big"><span>{fmt(sel ? sel.total : mode === "day" ? data.total : data.avg)}</span></p>
        </div>
        {!sel && data.hasPrev && ready && (
          <p className={`stime-change ${data.change == null ? "" : data.change >= 0 ? "up" : "down"}`}>
            <span>
              {data.change == null
                ? `前の${mode === "week" ? "週" : "月"}は記録なし`
                : `${data.change >= 0 ? "▲" : "▼"} 前の${mode === "week" ? "週" : "月"}より${Math.abs(data.change)}%${data.change >= 0 ? "増" : "減"}`}
            </span>
          </p>
        )}
      </div>

      <div className="stime-chart" role="img" aria-label={`${data.title}の勉強時間 合計${fmt(data.total)}`}>
        <div className="stime-grid">
          {ticks.map((t) => (
            <div key={t} className="stime-tick" style={{ bottom: `${(t / data.top) * 100}%` }}>
              <span>{tickLabel(t)}</span>
            </div>
          ))}
          {data.avg > 0 && (
            <div className="stime-avg" style={{ bottom: `${(data.avg / data.top) * 100}%` }}>
              <span>平均</span>
            </div>
          )}
        </div>
        <div className={`stime-bars ${data.bars.length > 7 ? "many" : ""}`}>
          {data.bars.map((b, i) => (
            <button
              key={b.key}
              type="button"
              className={`stime-bar ${picked === i ? "on" : ""} ${picked != null && picked !== i ? "dim" : ""}`}
              onClick={() => setPicked(picked === i ? null : i)}
              aria-label={`${mode === "day" ? `${i}時台` : md(new Date(b.start))} ${fmt(b.total)}`}
            >
              <span className="stime-stack" style={{ height: `${(b.total / data.top) * 100}%` }}>
                {KINDS.filter((c) => b.parts[c.id] > 0).map((c) => (
                  <span key={c.id} style={{ flexGrow: b.parts[c.id], background: c.color }} />
                ))}
              </span>
              <span className={`stime-day ${i === data.bars.length - 1 ? "last" : ""}`}>{barLabel(b, i)}</span>
            </button>
          ))}
        </div>
      </div>

      {sel ? (
        <ul className="stime-detail">
          {KINDS.filter((c) => sel.parts[c.id] >= 0.5).map((c) => (
            <li key={c.id}>
              <span className="dot" style={{ background: c.color }} />
              <span>{c.label}</span>
              <strong>{fmt(sel.parts[c.id])}</strong>
            </li>
          ))}
          {sel.total < 0.5 && <li className="stime-none"><span>この時間の記録はありません</span></li>}
        </ul>
      ) : (
        <p className="stime-foot">
          <span>{mode === "day" ? "記録した時刻から、勉強した分だけさかのぼって表示｜棒を押すと内訳" : `合計 ${fmt(data.total)}（学年をまたいだ全記録）｜前の期間とは1日平均で比べています｜棒を押すとその日の内訳`}</span>
        </p>
      )}
    </div>
  );
}
