// ホームのキャラ部分（デザイン元：docs/design/Launch.dc.html）
// growthExp・stage・bond・streak はサーバーが書いた値をそのまま表示する
import { useState } from "react";
import { Character } from "../characters/Character";
import { ChatSheet, GreetingBubble } from "./CharacterChat";
import { getFaculty, getUniversity } from "../game/universities";
import { BOND_UNLOCKS, GRADE_HOURS, bondOf, timeToGo, ymd } from "../game/rules";
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

export default function CharacterCard({ profile, logs, logsReady = true, menu }) {
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
  // 連続は「その日の合計が学年の目安の1/4」をこえたら+1（サーバーの update_streak と同じ）。今日あと何分かを出す
  const todayStr = ymd(today);
  const streakNeed = Math.round((GRADE_HOURS[grade] || 0) * 60 / 4);
  const studiedToday = profile.lastStudyDate === todayStr ? Number(profile.todayMinutes) || 0 : 0;
  const streakLeft = profile.lastStreakDate === todayStr ? 0 : Math.max(0, streakNeed - studiedToday);
  // がっつりペースで最終進化した色違いは、名前のうしろに ✦（D-2）
  const shiny = stage === 3 && profile.shiny === true;
  const name = uni.stageNames[stage - 1] || uni.character;
  const items = buildItems({ universityId: uni.id, growthExp: exp, bond, legends: profile?.legends });
  const worn = sanitizeEquipped(profile.equipped, items);
  const showEquip = stage === 3 ? wearsUniEquip(worn, items) : "normal";

  return (
    <section className="tama tama-home">
      <div className="tama-head">
        <div>
          {/* 学年はただの文字（C-1）。変える入口は ≡ メニューの「設定」だけ */}
          <p className="tama-note strong"><span>{`${grade}｜志望：${uni.name} ${faculty.name}`}</span></p>
          <p className="tama-name big">
            <span>{name}{shiny && <span className="tama-shiny-mark" aria-label="色違い">{"\u00A0✦"}</span>}</span>
            <span className="tama-stage" style={{ color: uni.colors[2] }}>{stageStatus(stage, bond)}</span>
          </p>
        </div>
        <div className="tama-head-right">
          <div className="tama-streak">
            <p className="tama-note"><span>{`連続 ${streak}日`}</span></p>
            <p className="tama-streak-x"><span>{s.bonus}</span></p>
            <p className="tama-tiny"><span>{s.hint}</span></p>
            {streakLeft > 0 && (
              <p className="tama-tiny strong"><span>{`今日あと${streakLeft}分で連続+1`}</span></p>
            )}
          </div>
          {menu}
        </div>
      </div>

      <div className="tama-goal">
        {/* 最終進化までは進化のゲージ。最終進化のあとは、同じ場所が親密度のピンクのゲージになる */}
        {stage === 3 && <BondGauge exp={exp} plan={plan} />}
        {goal ? (
          <>
            {stage !== 3 && (
              <div className="tama-bar">
                <div style={{ width: `${Math.min(100, (exp / goal.target) * 100)}%` }} />
              </div>
            )}
            <p className="tama-note">
              <span>{`${comma(exp)} / ${comma(goal.target)} EXP｜${goal.label} `}</span>
              <strong className="tama-togo">{togo.hours >= 1 ? `あと約${togo.hours}時間` : "あと1時間たらず"}</strong>
              <br />
              <span>
                {`（1日${hoursLabel(daily)}時間なら約${togo.days}日・${roughDate(addDays(today, togo.days))}／残り${comma(goal.target - exp)}EXP）`}
              </span>
            </p>
          </>
        ) : (
          <>
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
          enabled={logsReady}
          greetingKey={`${todayLogCount(logs, today)}-${stage}-${bond}-${profile.targetFacultyId}`}
          color={uni.colors[2]}
          onTalk={() => setChatOpen(true)}
          onGreeting={setGreeting}
        />
        <Character uni={uni.id} stage={stage} variant={showEquip} size={200} faculty={faculty} wear={worn} grade={profile?.grade} shiny={shiny} />
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

      {profile.seasonEnded && (
        <p className="tama-note tama-season-ended">
          <span>受験日でシーズンが終わりました。記録はこれまでどおりできますが、キャラはもう育ちません。新しい目標は ≡ メニューの「設定」から</span>
        </p>
      )}
      <WeekBars logs={logs} faculty={faculty} profile={profile} />
    </section>
  );
}

/** 親密度のゲージ（ピンク・最終進化のあとだけ）。育成EXPが「(親密度10の必要EXP−最終進化の必要EXP)÷10」たまるごとに1つ上がる（rules.js の bondOf と同じ） */
function BondGauge({ exp, plan }) {
  const final = plan?.exp?.final;
  const bond10 = plan?.exp?.bond10;
  if (!final || !bond10) return null;
  const step = (bond10 - final) / 10;
  const level = bondOf(exp, plan);
  const into = exp - final - level * step;
  const pct = level >= 10 ? 100 : Math.max(0, Math.min(100, (into / step) * 100));
  const nextKey = Object.keys(BOND_UNLOCKS).map(Number).find((k) => k > level);
  return (
    <div className="tama-bond">
      <div className="tama-bond-head">
        <span className="tama-bond-label">{`💗 親密度 ${level}／10`}</span>
        <span className="tama-bond-hearts" aria-hidden="true">
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className={i < level ? "on" : ""}>♥</span>
          ))}
        </span>
      </div>
      <div className="tama-bar tama-bar-bond" role="progressbar" aria-label="次の親密度まで" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div style={{ width: `${pct}%` }} />
      </div>
      {nextKey && level < 10 && (
        <p className="tama-tiny"><span>{`親密度${nextKey}で「${BOND_UNLOCKS[nextKey]}」`}</span></p>
      )}
    </div>
  );
}

/** 今日の記録の数（一言を取り直すきっかけに使う） */
function todayLogCount(logs, today) {
  const t = today.getTime();
  return (logs || []).filter((l) => l.dateObj && l.dateObj.getTime() >= t).length;
}

/** EXP倍率＝1＋その教科の配点比率（game/rules.js の expForLog と同じ式）。丸めずに出す（C-8：×1.55 など） */
const multiplierOf = (goal) => `×${(1 + goal / 100).toFixed(2)}`;

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
 * この7日の勉強の配分 と 志望学部の入試の配点（C-8。デザイン元：docs/design/Henkou.dc.html ①）
 * - 1行目に結論（いちばん足りない教科）を出す
 * - 棒＝あなた（教科の色・C-3）、黒い線＝入試の配点。凡例を図の下に出す
 * - 6教科（C-22）。今のシーズンの記録だけで数える（C-25）
 */
function WeekBars({ logs, faculty, profile }) {
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

  let conclusion;
  if (total === 0) {
    conclusion = (
      <>
        <span>まずは</span>
        <strong>{top.label}</strong>
        <span>{`から（配点${top.goal}%でいちばん大きい・EXP${multiplierOf(top.goal)}）`}</span>
      </>
    );
  } else if (short) {
    conclusion = (
      <>
        <span>いちばん足りないのは </span>
        <strong>{short.label}</strong>
        <span>{`（配点${short.goal}%・あなた${short.me}%）`}</span>
      </>
    );
  } else {
    conclusion = <span>{`配点どおりのバランスです（どの教科も差が${SHORT_THRESHOLD}ポイント未満）`}</span>;
  }

  return (
    <div className="tama-card tama-week">
      <p className="tama-strong small">
        <span>{`この7日の勉強の配分 と ${faculty.name}の入試の配点`}</span>
      </p>
      <p className="tama-week-conclusion">{conclusion}</p>

      <div className="tama-week-row tama-week-head" aria-hidden="true">
        <span />
        <span />
        <span className="tama-week-cols">
          <span>あなた</span>
          <span>配点</span>
          <span>EXP</span>
        </span>
      </div>

      {rows.map((r) => (
        <div key={r.id} className={`tama-week-row ${short && short.id === r.id ? "is-short" : ""}`}>
          <span className="tama-week-name" style={{ color: r.color }}>{r.label}</span>
          <div
            className="tama-week-bar"
            role="img"
            aria-label={`${r.label}：この7日の勉強の${r.me}%、入試の配点${r.goal}%、EXP${multiplierOf(r.goal)}`}
          >
            <div style={{ width: `${r.me}%`, background: r.color }} />
            <i style={{ left: `${r.goal}%` }} />
          </div>
          <span className="tama-week-cols">
            <span className="tama-week-me" style={{ color: r.me > 0 ? r.color : undefined }}>{`${r.me}%`}</span>
            <span className="tama-week-goal">{`${r.goal}%`}</span>
            <strong>{multiplierOf(r.goal)}</strong>
          </span>
        </div>
      ))}

      <div className="tama-week-legend">
        <span className="tama-week-legend-item"><span className="tama-week-legend-bar" aria-hidden="true" /><span>棒＝あなた（この7日の勉強の割合）</span></span>
        <span className="tama-week-legend-item"><span className="tama-week-legend-line" aria-hidden="true" /><span>黒い線＝入試の配点（試験での割合）</span></span>
        <span><span>EXP＝その教科を勉強したときのEXP倍率。配点が大きい教科ほど増えます</span></span>
      </div>
      {total > 0 && <p className="tama-tiny"><span>{`この7日の合計 ${total}分`}</span></p>}
    </div>
  );
}
