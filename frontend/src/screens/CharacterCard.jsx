// ホームのキャラ部分（デザイン元：docs/design/Launch.dc.html）
// growthExp・stage・bond・streak はサーバーが書いた値をそのまま表示する
import { Character } from "../characters/Character";
import { getFaculty, getUniversity } from "../game/universities";
import { timeToGo } from "../game/rules";
import {
  GRADE_FROM_APP, addDays, comma, daysBetween, hoursLabel, nextGoal, parseYmd,
  roughDate, streakInfo, todayHours, todayStart,
} from "../game/display";
import { CATEGORIES, SUBJECT_CATEGORY } from "../game/subjects";
import { buildItems, sanitizeEquipped, wearsUniEquip } from "../game/items";
import "./tama.css";

const DAY_MS = 864e5;

function stageStatus(stage, bond) {
  if (stage >= 3) return bond > 0 ? `最終進化・親密度${bond}` : "最終進化";
  if (stage === 2) return "1回進化ずみ";
  return "うまれたて";
}

export default function CharacterCard({ profile, logs, menu }) {
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
          <p className="tama-note strong"><span>{`志望：${uni.name} ${faculty.name}`}</span></p>
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
        <Character uni={uni.id} stage={stage} variant={showEquip ? "equip" : "normal"} size={200} />
      </div>

      <WeekBars logs={logs} faculty={faculty} />
    </section>
  );
}

/** この7日の教科の割合と、志望学部の配点（黒い線） */
function WeekBars({ logs, faculty }) {
  const since = Date.now() - 7 * DAY_MS;
  const recent = (logs || []).filter((l) => l.dateObj && l.dateObj.getTime() >= since);
  const total = recent.reduce((a, l) => a + (Number(l.minutes) || 0), 0);
  const byCat = {};
  for (const l of recent) {
    const c = SUBJECT_CATEGORY[l.subject];
    if (c) byCat[c] = (byCat[c] || 0) + (Number(l.minutes) || 0);
  }

  return (
    <div className="tama-card tama-week">
      <p className="tama-strong small"><span>{`この7日（${total}分）と${faculty.name}の配点`}</span></p>
      {total === 0 ? (
        <p className="tama-note"><span>まだ記録がありません。最初の記録でキャラが育ちはじめます</span></p>
      ) : (
        CATEGORIES.map((c) => {
          const me = Math.round(((byCat[c.id] || 0) / total) * 100);
          const goal = faculty.weights[c.id] ?? 0;
          return (
            <div key={c.id} className="tama-week-row">
              <span className="tama-week-name" style={{ color: c.color }}>{c.label}</span>
              <div className="tama-week-bar">
                <div style={{ width: `${me}%`, background: c.color }} />
                <i style={{ left: `${goal}%` }} />
              </div>
              <span className="tama-week-num">{`${me}%/${goal}% ×${(1 + goal / 100).toFixed(1)}`}</span>
            </div>
          );
        })
      )}
      <p className="tama-tiny"><span>棒＝自分、黒い線＝配点、右の×＝EXP倍率</span></p>
    </div>
  );
}
