// ホームのキャラ部分（デザイン元：docs/design/Launch.dc.html）
// growthExp・stage・bond・streak はサーバーが書いた値をそのまま表示する
import { useState } from "react";
import { Character } from "../characters/Character";
import { ChatSheet, GreetingBubble } from "./CharacterChat";
import { getFaculty, getUniversity } from "../game/universities";
import { timeToGo } from "../game/rules";
import {
  GRADE_FROM_APP, addDays, comma, daysBetween, hoursLabel, nextGoal, parseYmd,
  roughDate, streakInfo, todayHours, todayStart,
} from "../game/display";
import { CATEGORIES, categoryOfLog, inSeason } from "../game/subjects";
import { buildItems, sanitizeEquipped, wearsUniEquip } from "../game/items";
import "./tama.css";

const DAY_MS = 864e5;

function stageStatus(stage, bond) {
  if (stage >= 3) return bond > 0 ? `最終進化・親密度${bond}` : "最終進化";
  if (stage === 2) return "1回進化ずみ";
  return "うまれたて";
}

export default function CharacterCard({ profile, logs, menu }) {
  // フックは早期 return より前に置く
  const [chatOpen, setChatOpen] = useState(false);
  const [greeting, setGreeting] = useState("");
  const faculty = getFaculty(profile?.targetFacultyId);
  const uni = faculty && getUniversity(faculty.universityId);
  const plan = profile?.plan;
  const grade = GRADE_FROM_APP[profile?.grade];
  if (!faculty || !uni || !plan?.exp || !grade) return null;

  const exp = Math.max(0, Number(profile.growthExp) || 0);
  const stage = [1, 2, 3].includes(profile.stage) ? profile.stage : 1;
  const bond = Math.max(0, Math.min(10, Number(profile.bond) || 0));
  const streak = Math.max(0, Number(profile.streak) || 0);
  const today = todayStart();

  const goal = nextGoal(exp, plan);
  const daily = todayHours(grade);
  const togo = goal ? timeToGo(goal.target - exp, faculty, streak, grade, today) : null;
  const seasonEnd = parseYmd(plan.seasonEnd);
  const seasonLeft = seasonEnd ? Math.max(0, daysBetween(today, seasonEnd)) : null;
  const s = streakInfo(streak);
  const name = uni.stageNames[stage - 1] || uni.character;
  const items = buildItems({ universityId: uni.id, growthExp: exp, bond });
  const showEquip = stage === 3 && wearsUniEquip(sanitizeEquipped(profile.equipped, items), items);

  return (
    <section className="tama tama-home">
      <div className="tama-head">
        <div>
          {/* 学年はただの文字（C-1）。変える入口は ≡ メニューの「設定」だけ */}
          <p className="tama-note strong"><span>{`${grade}｜志望：${uni.name} ${faculty.name}`}</span></p>
          <p className="tama-name big">
            <span>{name}</span>
            <span className="tama-stage" style={{ color: uni.colors[2] }}>{stageStatus(stage, bond)}</span>
          </p>
        </div>
        <div className="tama-head-right">
          <div className="tama-streak">
            <p className="tama-note"><span>{`連続 ${streak}日`}</span></p>
            <p className="tama-streak-x"><span>{s.bonus}</span></p>
            <p className="tama-tiny"><span>{s.hint}</span></p>
          </div>
          {menu}
        </div>
      </div>

      <div className="tama-goal">
        {goal ? (
          <>
            <div className="tama-bar">
              <div style={{ width: `${Math.min(100, (exp / goal.target) * 100)}%` }} />
            </div>
            <p className="tama-note">
              <span>{`${comma(exp)} / ${comma(goal.target)} EXP｜${goal.label} `}</span>
              <strong className="tama-togo">{`あと約${togo.hours}時間`}</strong>
              <br />
              <span>
                {`（1日${hoursLabel(daily)}時間なら約${togo.days}日・${roughDate(addDays(today, togo.days))}／残り${comma(goal.target - exp)}EXP）`}
              </span>
            </p>
          </>
        ) : (
          <>
            <div className="tama-bar"><div style={{ width: "100%" }} /></div>
            <p className="tama-note"><strong className="tama-togo">大のなかよし！</strong><span>{`（${comma(exp)} EXP）`}</span></p>
          </>
        )}
        <p className="tama-season">
          <span>
            {`${grade}シーズン${seasonLeft != null ? ` 残り${seasonLeft}日` : ""}｜今の目安 1日${hoursLabel(daily)}時間`}
          </span>
        </p>
      </div>

      <div className="tama-stage-box">
        <GreetingBubble
          greetingKey={`${todayLogCount(logs, today)}-${stage}-${profile.targetFacultyId}`}
          color={uni.colors[2]}
          onTalk={() => setChatOpen(true)}
          onGreeting={setGreeting}
        />
        <Character uni={uni.id} stage={stage} variant={showEquip ? "equip" : "normal"} size={200} faculty={faculty} />
      </div>

      {chatOpen && (
        <ChatSheet
          uni={uni}
          stage={stage}
          faculty={faculty}
          name={name.split("（")[0]}
          greeting={greeting}
          onClose={() => setChatOpen(false)}
        />
      )}

      <WeekBars logs={logs} faculty={faculty} profile={profile} />
    </section>
  );
}

/** 今日の記録の数（一言を取り直すきっかけに使う） */
function todayLogCount(logs, today) {
  const t = today.getTime();
  return (logs || []).filter((l) => l.dateObj && l.dateObj.getTime() >= t).length;
}

/** EXP倍率＝1＋その教科の配点比率（game/rules.js の expForLog と同じ式） */
const multiplierOf = (goal) => `×${(1 + goal / 100).toFixed(1)}`;

/** 配点より「足りない」とみなす差（ポイント）。これ未満なら配点どおりとする */
const SHORT_THRESHOLD = 5;

/**
 * いちばん足りない教科を1つ選ぶ。配点が0%の教科は対象外。
 * 差が同じなら配点が大きい教科を優先する
 */
function pickShortage(rows) {
  const candidates = rows.filter((r) => r.goal > 0 && r.goal - r.me >= SHORT_THRESHOLD);
  candidates.sort((a, b) => (b.goal - b.me) - (a.goal - a.me) || b.goal - a.goal);
  return candidates[0] || null;
}

/**
 * この7日の教科の割合（6教科・C-22）と、志望学部の配点。今のシーズンの記録だけで数える（C-25）
 * 上：いちばん足りない教科を1つだけ提案するカード／下：開くと見出し付きの表
 */
function WeekBars({ logs, faculty, profile }) {
  const [open, setOpen] = useState(false);
  const since = Date.now() - 7 * DAY_MS;
  const recent = (logs || []).filter((l) => l.dateObj && l.dateObj.getTime() >= since && inSeason(l, profile));
  const total = recent.reduce((a, l) => a + (Number(l.minutes) || 0), 0);
  const byCat = {};
  for (const l of recent) {
    const c = categoryOfLog(l);
    if (c) byCat[c] = (byCat[c] || 0) + (Number(l.minutes) || 0);
  }

  const rows = CATEGORIES.map((c) => ({
    ...c,
    minutes: byCat[c.id] || 0,
    me: total > 0 ? Math.round(((byCat[c.id] || 0) / total) * 100) : 0,
    goal: faculty.weights[c.id] ?? 0,
  }));
  const top = [...rows].sort((a, b) => b.goal - a.goal)[0];
  const short = total > 0 ? pickShortage(rows) : null;

  let tip;
  if (total === 0) {
    tip = {
      color: top.color,
      title: `まずは${top.label}から始めよう。やると${multiplierOf(top.goal)}`,
      sub: `${faculty.name}でいちばん配点が大きい教科です（${top.goal}%）`,
    };
  } else if (short) {
    tip = {
      color: short.color,
      title: `今は${short.label}が足りません。やると${multiplierOf(short.goal)}`,
      sub: `配点${short.goal}%に対して、この7日は${short.me}%（${short.minutes}分）`,
    };
  } else {
    tip = {
      color: "#2E9E6A",
      title: "配点どおりのバランスです。この調子！",
      sub: `どの教科も、配点との差が${SHORT_THRESHOLD}ポイント未満です`,
    };
  }

  return (
    <div className="tama-card tama-week">
      <p className="tama-strong small"><span>{`この7日（${total}分）と${faculty.name}の配点`}</span></p>

      <div className="tama-short" style={{ borderColor: tip.color }}>
        <p className="tama-short-title" style={{ color: tip.color }}><span>{tip.title}</span></p>
        <p className="tama-short-sub"><span>{tip.sub}</span></p>
      </div>

      <button type="button" className="tama-week-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>{open ? "▲ 教科ごとの内訳を閉じる" : "▼ 教科ごとの内訳を見る"}</span>
      </button>

      {open && (
        <>
          <table className="tama-week-table">
            <thead>
              <tr>
                <th scope="col"><span>教科</span></th>
                <th scope="col"><span>この7日の自分</span></th>
                <th scope="col"><span>志望学部の配点</span></th>
                <th scope="col"><span>EXP倍率</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={short && short.id === r.id ? "is-short" : undefined}>
                  <th scope="row" style={{ color: r.color }}><span>{r.label}</span></th>
                  <td>
                    <div className="tama-week-bar" aria-hidden="true">
                      <div style={{ width: `${r.me}%`, background: r.color }} />
                      <i style={{ left: `${r.goal}%` }} />
                    </div>
                    <span className="tama-week-pct">{`${r.me}%`}</span>
                  </td>
                  <td><span>{`${r.goal}%`}</span></td>
                  <td><span>{r.goal > 0 ? multiplierOf(r.goal) : "×1.0"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="tama-tiny">
            <span>
              {"この7日の自分＝勉強時間のうちその教科の割合（棒）。志望学部の配点＝2次試験の配点の割合（黒い線）。EXP倍率＝その教科を勉強したときに育成EXPが何倍になるか（1＋配点の割合）"}
            </span>
          </p>
        </>
      )}
    </div>
  );
}
