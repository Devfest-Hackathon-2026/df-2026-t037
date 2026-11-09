// 勉強タイマー（デザイン元：docs/design/Timer.dc.html、変更後は Henkou.dc.html の③・③-2）
// - 開始時刻は users/{uid}.timerStartedAt（サーバー時刻）。あるあいだは着替えがロックされる
// - 目標の時間になったら終わりの音（C-6）→「もう少し続ける？」（C-16）。延長は何回でも、同じ1回の記録にまとめる
// - 延長中・ふりかえり中も timerStartedAt は残す（＝着替えロックのまま）。記録が終わったら null に戻す
// - 画面を閉じていて音が鳴らなかったときは、次に開いたときに「もう少し続ける？」から出す
import { useEffect, useState } from "react";
import { Character } from "../characters/Character";
import { expForLog, streakBonus } from "../game/rules";
import { getFaculty, getUniversity } from "../game/universities";
import { CATEGORIES, SUBJECT_CATEGORY } from "../game/subjects";
import { colorOfSubject } from "../game/subjectColors";
import { buildItems, sanitizeEquipped, wearsUniEquip } from "../game/items";
import { loadTimerLocal, saveTimerLocal, startTimer, stopTimer } from "../game/userWrites";
import { isChimeOn, playChime, unlockChime } from "../lib/chime";
import { requestAdvice } from "../api";
import Menu from "./Menu";
import { RankHints } from "./RankHelp";
import "./tama.css";

const GOALS = [30, 45, 60, 90, 120];
const EXTEND = [5, 10, 15, 30];
const MAX_RECORD = 600; // 1回の記録の上限（/advise と同じ）
const RING = 2 * Math.PI * 96;

const newLocal = (subject, goal) => ({
  subject, goal, extra: 0, pausedMs: 0, pausedAt: null, phase: "run", chimed: 0, measured: 0, recordMinutes: 0, reflection: "",
});

function multiplierText(subject, faculty) {
  const cat = SUBJECT_CATEGORY[subject];
  const w = cat ? faculty?.weights[cat] ?? 0 : 0;
  const label = CATEGORIES.find((c) => c.id === cat)?.label;
  return { w, text: label ? `${label} ×${(1 + w / 100).toFixed(2)}` : `×${(1).toFixed(2)}` };
}

const clock = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

/** 一時停止・延長の待ち時間をのぞいた、勉強した時間（ミリ秒） */
function elapsedOf(local, startedMs, now) {
  const pausedNow = local.pausedAt ? now - local.pausedAt : 0;
  return Math.max(0, now - startedMs - (local.pausedMs || 0) - pausedNow);
}

const isWhole = (v, min, max) => /^\d+$/.test(String(v)) && Number(v) >= min && Number(v) <= max;

export default function Timer({ uid, profile, subjects, onRecorded, onClose, onSettings }) {
  const startedAt = profile?.timerStartedAt?.toDate ? profile.timerStartedAt.toDate() : null;
  const startedMs = startedAt ? startedAt.getTime() : null;
  const faculty = getFaculty(profile?.targetFacultyId);
  const uni = faculty && getUniversity(faculty.universityId);
  const stage = [1, 2, 3].includes(profile?.stage) ? profile.stage : 1;
  const items = buildItems({ universityId: uni?.id, growthExp: profile?.growthExp, bond: profile?.bond, legends: profile?.legends });
  const worn = sanitizeEquipped(profile?.equipped, items);
  const equip = stage === 3 ? wearsUniEquip(worn, items) : "normal";

  const [local, setLocal] = useState(() => {
    const saved = loadTimerLocal(uid);
    return saved && subjects.includes(saved.subject) ? { ...newLocal(saved.subject, 60), ...saved } : newLocal(subjects[0], 60);
  });
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [customExtend, setCustomExtend] = useState("");
  const [recorded, setRecorded] = useState(null); // 記録は保存できたが、タイマーを止められなかったとき
  const [error, setError] = useState("");

  const goalTotal = (local.goal || 60) + (local.extra || 0);
  const elapsedMs = startedMs != null ? elapsedOf(local, startedMs, now) : 0;

  const updateLocal = (patch) => {
    setLocal((prev) => {
      const next = { ...prev, ...patch };
      saveTimerLocal(uid, next);
      return next;
    });
  };

  useEffect(() => {
    if (startedMs == null || local.phase !== "run") return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedMs, local.phase]);

  // 目標の時間になったら、そこで時計を止めて「もう少し続ける？」へ（画面を閉じていた分は勉強時間に入れない）
  useEffect(() => {
    if (startedMs == null || local.phase !== "run" || local.pausedAt) return;
    const goalMs = goalTotal * 60000;
    if (elapsedMs < goalMs) return;
    const reachedAt = startedMs + (local.pausedMs || 0) + goalMs;
    const shouldChime = isChimeOn() && local.chimed !== goalTotal;
    updateLocal({ phase: "ask", pausedAt: reachedAt, chimed: goalTotal });
    if (shouldChime) playChime();
  }, [startedMs, local.phase, local.pausedAt, local.pausedMs, local.chimed, goalTotal, elapsedMs]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn) => {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      console.error("[timer error]", err);
      // api.js からのエラーは画面向けの文言。Firebase のエラー（code つき）は中身を見せない
      setError(err?.code || !err?.message ? "保存できませんでした。通信を確認してもう一度お試しください。" : err.message);
    } finally {
      setBusy(false);
    }
  };

  const quitRow = confirmQuit ? (
    <div className="tama-timer-quit">
      <span>記録せずにやめますか？</span>
      <button type="button" className="tama-link light" onClick={() => run(async () => { await stopTimer(uid); saveTimerLocal(uid, null); onClose(); })} disabled={busy}>
        <span>やめる</span>
      </button>
      <button type="button" className="tama-link light" onClick={() => setConfirmQuit(false)}><span>つづける</span></button>
    </div>
  ) : (
    <button type="button" className="tama-link light" onClick={() => setConfirmQuit(true)}>
      <span>記録せずにやめる</span>
    </button>
  );

  const buddy = (size) => uni && <Character uni={uni.id} stage={stage} variant={equip} size={size} faculty={faculty} wear={worn} grade={profile?.grade} />;
  const subjectTag = (
    <span className="tama-subj-dot" style={{ background: colorOfSubject(local.subject, SUBJECT_CATEGORY[local.subject]) }} />
  );
  const timerTitle = local.extra ? `${local.subject}｜${local.goal}分＋延長${local.extra}分` : `${local.subject}｜${local.goal}分タイマー`;

  // ===== 開始前：教科と目標を選ぶ =====
  if (!startedAt) {
    return (
      <div className="tama tama-timer">
        <div className="tama-timer-top">
          <p className="tama-timer-kicker"><span>勉強タイマー</span></p>
          <button type="button" className="tama-menu-btn dark" onClick={onClose} aria-label="もどる">
            <span>×</span>
          </button>
        </div>
        <p className="tama-timer-label"><span>なにを勉強する？</span></p>
        <div className="tama-wrap center">
          {subjects.map((s) => {
            const color = colorOfSubject(s, SUBJECT_CATEGORY[s]);
            const on = local.subject === s;
            return (
              <button
                key={s}
                type="button"
                className={`tama-timer-chip ${on ? "on" : ""}`}
                style={on ? { background: color, borderColor: color, color: "#FFFFFF" } : { borderColor: color }}
                onClick={() => updateLocal({ subject: s })}
              >
                <span>{`${s}（${multiplierText(s, faculty).text}）`}</span>
              </button>
            );
          })}
        </div>
        <p className="tama-timer-label"><span>目標</span></p>
        <div className="tama-wrap center">
          {GOALS.map((g) => (
            <button
              key={g}
              type="button"
              className={`tama-timer-chip ${local.goal === g ? "on" : ""}`}
              onClick={() => updateLocal({ goal: g })}
            >
              <span>{`${g}分`}</span>
            </button>
          ))}
        </div>
        {buddy(140)}
        {error && <div className="tama-error"><span>{error}</span></div>}
        <div className="tama-timer-actions">
          <button
            type="button"
            className="tama-btn"
            disabled={busy}
            onClick={() => {
              unlockChime(); // スマホは操作の中で音の準備をしておく
              run(async () => {
                const fresh = newLocal(local.subject, local.goal);
                setLocal(fresh);
                saveTimerLocal(uid, fresh);
                await startTimer(uid);
              });
            }}
          >
            <span>スタート</span>
          </button>
        </div>
      </div>
    );
  }

  // ===== ③ 時間になった：もう少し続ける？ =====
  if (local.phase === "ask") {
    const extend = (n) => {
      unlockChime();
      const t = Date.now();
      updateLocal({ phase: "run", extra: (local.extra || 0) + n, pausedMs: (local.pausedMs || 0) + (t - (local.pausedAt || t)), pausedAt: null });
      setNow(t);
      setCustomExtend("");
    };
    const customOk = isWhole(customExtend, 1, 180);
    return (
      <div className="tama tama-timer navy">
        <div className="tama-timer-top">
          <p className="tama-timer-kicker">{subjectTag}<span>{timerTitle}</span></p>
          <Menu timerRunning dark onSettings={onSettings} onKisekae={() => {}} />
        </div>

        <div className="tama-ring small">
          <svg width="190" height="190" viewBox="0 0 220 220" aria-hidden="true">
            <circle cx="110" cy="110" r="96" fill="none" stroke="#2A3A66" strokeWidth="12" />
            <circle cx="110" cy="110" r="96" fill="none" stroke="#F2C230" strokeWidth="12" strokeDasharray={`${RING.toFixed(1)} ${RING.toFixed(1)}`} transform="rotate(-90 110 110)" />
          </svg>
          <div className="tama-ring-text">
            <p className="tama-ring-time small"><span>{clock(goalTotal * 60000)}</span></p>
            <p className="tama-ring-done"><span>時間になりました</span></p>
          </div>
        </div>

        <p className="tama-chime-pill">
          <span aria-hidden="true">🔔</span>
          <span>{isChimeOn() ? "ポン・ポン・ポーン（終わりの音）" : "終わりの音はオフです（≡メニューで変えられます）"}</span>
        </p>

        <div className="tama-ask">
          <p className="tama-ask-title"><span>もう少し続ける？</span></p>
          <p className="tama-ask-sub"><span>{`ここまでの${goalTotal}分はそのまま。足した分も同じ記録にまとまります`}</span></p>
          <div className="tama-ask-grid">
            {EXTEND.map((n) => (
              <button key={n} type="button" onClick={() => extend(n)}><span>{`+${n}分`}</span></button>
            ))}
          </div>
          <div className="tama-ask-custom">
            <label htmlFor="extend-min"><span>自分で決める</span></label>
            <input
              id="extend-min"
              type="number"
              min="1"
              max="180"
              step="1"
              inputMode="numeric"
              value={customExtend}
              onChange={(e) => setCustomExtend(e.target.value)}
            />
            <span>分</span>
            <button type="button" disabled={!customOk} onClick={() => extend(Number(customExtend))}><span>延長</span></button>
          </div>
          {customExtend !== "" && !customOk && <p className="tama-ask-err"><span>1〜180分で入力してね</span></p>}
        </div>
        <p className="tama-timer-hint left"><span>延長中も着替えはロック。延長が終わるとまた音が鳴って、同じ質問が出る</span></p>

        {error && <div className="tama-error"><span>{error}</span></div>}
        <div className="tama-timer-actions">
          <button
            type="button"
            className="tama-btn"
            onClick={() => updateLocal({ phase: "reflect", measured: goalTotal, recordMinutes: Math.min(goalTotal, MAX_RECORD) })}
          >
            <span>ここで終わる → ふりかえりへ</span>
          </button>
        </div>
        {quitRow}
      </div>
    );
  }

  // ===== ③-2 ふりかえり（記録する時間を1分ずつ直せる） =====
  if (local.phase === "reflect") {
    const measured = Math.max(1, local.measured || 1);
    const maxMin = Math.min(measured, MAX_RECORD);
    const m = local.recordMinutes;
    const minutesOk = isWhole(m, 1, maxMin);
    const text = local.reflection || "";
    const setMin = (v) => updateLocal({ recordMinutes: v });

    const submit = () => run(async () => {
      let result = recorded;
      if (!result) {
        result = await requestAdvice({ subject: local.subject, minutes: Number(m), reflection: text, fromTimer: true });
        setRecorded(result);
      }
      try {
        await stopTimer(uid);
      } catch (err) {
        console.error("[timer stop error]", err);
        throw new Error("記録はできましたが、タイマーを止められませんでした。もう一度押してください。");
      }
      saveTimerLocal(uid, null);
      // 教科と分数は、結果カードで育成EXPの式を出すために残す
      onRecorded({ ...result, subject: local.subject, minutes: Number(m) });
    });

    return (
      <div className="tama tama-timer navy">
        <div className="tama-timer-top">
          <p className="tama-timer-kicker">{subjectTag}<span>{local.extra ? timerTitle : `${local.subject}｜${measured}分`}</span></p>
          <Menu timerRunning dark onSettings={onSettings} onKisekae={() => {}} />
        </div>

        <div className="tama-white-card">
          <p className="tama-strong small"><span>記録する勉強時間</span></p>
          <div className="tama-stepper">
            <button type="button" aria-label="1分へらす" disabled={!minutesOk || Number(m) <= 1 || Boolean(recorded)} onClick={() => setMin(Number(m) - 1)}>
              <span>−</span>
            </button>
            <label className="tama-stepper-box">
              <input
                type="number"
                min="1"
                max={maxMin}
                step="1"
                inputMode="numeric"
                aria-label="記録する分数"
                value={m}
                disabled={Boolean(recorded)}
                onChange={(e) => setMin(e.target.value)}
              />
              <span>分</span>
            </label>
            <button type="button" aria-label="1分ふやす" disabled={!minutesOk || Number(m) >= maxMin || Boolean(recorded)} onClick={() => setMin(Number(m) + 1)}>
              <span>＋</span>
            </button>
          </div>
          <p className="tama-note">
            <span>{`タイマーで測ったのは${measured}分。休けいした分などを1分ずつ減らせる（測った時間より多くはできない）`}</span>
            {measured > MAX_RECORD && <span>{`。1回の記録は${MAX_RECORD}分まで`}</span>}
          </p>
          {!minutesOk && <p className="tama-field-err"><span>{`1〜${maxMin}分で入力してね`}</span></p>}
        </div>

        <div className="tama-white-card">
          <p className="tama-strong"><span>おつかれさま！ふりかえりを書こう</span></p>
          <p className="tama-note"><span>何をどれだけ・どこでつまずいたか・次に何をやるか</span></p>
          <RankHints />
          <textarea
            className="tama-textarea"
            value={text}
            maxLength={2000}
            disabled={Boolean(recorded)}
            onChange={(e) => updateLocal({ reflection: e.target.value })}
            placeholder="例：青チャート数列の例題20〜28。漸化式で+1するのは等比数列の形にそろえるためだと気づいた。明日、例題25と27を解き直す"
          />
        </div>
        <p className="tama-timer-hint left"><span>画面を閉じていたときは音が鳴らないので、次に開いたときに「もう少し続ける？」から出る。≡メニューで音のオン・オフ</span></p>

        {error && <div className="tama-error"><span>{error}</span></div>}
        <div className="tama-timer-actions">
          <button type="button" className="tama-btn" onClick={submit} disabled={busy || !minutesOk || !text.trim()}>
            {busy ? (
              <span key="busy" className="btn-inner"><span className="spinner" /><span>AIが採点中…</span></span>
            ) : (
              <span key="idle">{minutesOk ? `${Number(m)}分を記録してEXPをあげる` : "記録してEXPをあげる"}</span>
            )}
          </button>
        </div>
        {!recorded && quitRow}
      </div>
    );
  }

  // ===== 計測中 =====
  const elapsedMin = Math.floor(elapsedMs / 60000);
  const progress = Math.min(1, elapsedMs / (goalTotal * 60000));
  const streak = Math.max(0, Number(profile?.streak) || 0);
  const mult = multiplierText(local.subject, faculty);
  const cat = SUBJECT_CATEGORY[local.subject];
  const expNow = faculty ? expForLog(elapsedMin, cat, faculty.weights, streak) : 0;

  const togglePause = () => {
    if (local.pausedAt) updateLocal({ pausedMs: (local.pausedMs || 0) + (Date.now() - local.pausedAt), pausedAt: null });
    else updateLocal({ pausedAt: Date.now() });
    setNow(Date.now());
  };

  // 目標より前に終わるときは、そこまでの時間でふりかえりへ（C-23：秒を切り上げて最低1分。サーバーの上限と同じ式）
  const endEarly = () => {
    const t = local.pausedAt || Date.now();
    const minutes = Math.max(1, Math.ceil(elapsedOf({ ...local, pausedAt: null }, startedMs, t) / 60000));
    updateLocal({ phase: "reflect", pausedAt: t, measured: minutes, recordMinutes: Math.min(minutes, MAX_RECORD) });
  };

  return (
    <div className="tama tama-timer navy">
      <div className="tama-timer-top">
        <p className="tama-timer-kicker">
          <span className={`tama-dot ${local.pausedAt ? "paused" : ""}`} />
          <span>{local.pausedAt ? "勉強タイマー 一時停止中" : "勉強タイマー 計測中"}</span>
        </p>
        <Menu timerRunning dark onSettings={onSettings} onKisekae={() => {}} />
      </div>

      <p className="tama-timer-subject">{subjectTag}<span>{`${local.subject}（${mult.text}）`}</span></p>

      <div className="tama-ring">
        <svg width="220" height="220" viewBox="0 0 220 220" role="img" aria-label={`目標${goalTotal}分のうち${elapsedMin}分が経過`}>
          <circle cx="110" cy="110" r="96" fill="none" stroke="#2A3A66" strokeWidth="12" />
          <circle
            cx="110" cy="110" r="96" fill="none" stroke="#F2C230" strokeWidth="12" strokeLinecap="round"
            strokeDasharray={`${(progress * RING).toFixed(1)} ${RING.toFixed(1)}`}
            transform="rotate(-90 110 110)"
          />
        </svg>
        <div className="tama-ring-text">
          <p className="tama-ring-time"><span>{clock(elapsedMs)}</span></p>
          <p className="tama-ring-goal"><span>{local.extra ? `目標 ${local.goal}分＋延長${local.extra}分` : `目標 ${local.goal}分`}</span></p>
        </div>
      </div>

      <div className="tama-timer-buddy">
        {buddy(120)}
        <div className="tama-bubble">
          <span>いっしょに集中中…</span>
          <br />
          <span className="tama-note">しゃべらずに見守るね</span>
        </div>
      </div>

      <p className="tama-timer-exp">
        <span>いまのEXP </span>
        <strong>{`+${expNow}`}</strong>
        <span>{`（${elapsedMin}分 × ${(1 + mult.w / 100).toFixed(2)} × 連続${streakBonus(streak).toFixed(2)}）`}</span>
      </p>
      <p className="tama-timer-hint">
        <span>記録すると言語化ランクの倍率（S×1.3〜C×1.0）もかかります</span>
      </p>

      {error && <div className="tama-error"><span>{error}</span></div>}

      <div className="tama-timer-actions">
        <button type="button" className="tama-btn outline" onClick={togglePause} disabled={busy}>
          <span>{local.pausedAt ? "再開" : "一時停止"}</span>
        </button>
        <button type="button" className="tama-btn" onClick={endEarly} disabled={busy}>
          <span>ここで終わる</span>
        </button>
      </div>
      {quitRow}
    </div>
  );
}
