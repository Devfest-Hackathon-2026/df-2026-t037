// 勉強タイマー（デザイン元：docs/design/Timer.dc.html）
// 開始時刻は users/{uid}.timerStartedAt（サーバー時刻）。あるあいだは着替えがロックされる
// 終了したら手で記録の画面に、教科と分数を入れた状態で渡す（採点とEXPはこれまでどおり /advise）
import { useEffect, useState } from "react";
import { Character } from "../characters/Character";
import { expForLog, streakBonus } from "../game/rules";
import { getFaculty, getUniversity } from "../game/universities";
import { CATEGORIES, SUBJECT_CATEGORY } from "../game/subjects";
import { buildItems, sanitizeEquipped, wearsUniEquip } from "../game/items";
import { loadTimerLocal, saveTimerLocal, startTimer, stopTimer } from "../game/userWrites";
import Menu from "./Menu";
import "./tama.css";

const GOALS = [30, 45, 60, 90, 120];
const RING = 2 * Math.PI * 96;

function multiplierText(subject, faculty) {
  const cat = SUBJECT_CATEGORY[subject];
  const w = cat ? faculty?.weights[cat] ?? 0 : 0;
  const label = CATEGORIES.find((c) => c.id === cat)?.label;
  return { w, text: label ? `${label} ×${(1 + w / 100).toFixed(1)}` : `×${(1).toFixed(1)}` };
}

export default function Timer({ uid, profile, subjects, onFinish, onClose, onSettings }) {
  const startedAt = profile?.timerStartedAt?.toDate ? profile.timerStartedAt.toDate() : null;
  const faculty = getFaculty(profile?.targetFacultyId);
  const uni = faculty && getUniversity(faculty.universityId);
  const stage = [1, 2, 3].includes(profile?.stage) ? profile.stage : 1;
  const items = buildItems({ universityId: uni?.id, growthExp: profile?.growthExp, bond: profile?.bond });
  const equip = stage === 3 && wearsUniEquip(sanitizeEquipped(profile?.equipped, items), items);

  const [local, setLocal] = useState(() => loadTimerLocal(uid) || { subject: subjects[0], goal: 60, pausedMs: 0, pausedAt: null });
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [error, setError] = useState("");

  const startedMs = startedAt ? startedAt.getTime() : null;
  useEffect(() => {
    if (startedMs == null) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedMs]);

  const updateLocal = (patch) => {
    const next = { ...local, ...patch };
    setLocal(next);
    saveTimerLocal(uid, next);
  };

  const run = async (fn) => {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      console.error("[timer error]", err);
      setError("タイマーを保存できませんでした。通信を確認してもう一度お試しください。");
    } finally {
      setBusy(false);
    }
  };

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
          {subjects.map((s) => (
            <button
              key={s}
              type="button"
              className={`tama-timer-chip ${local.subject === s ? "on" : ""}`}
              onClick={() => updateLocal({ subject: s })}
            >
              <span>{`${s}（${multiplierText(s, faculty).text}）`}</span>
            </button>
          ))}
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
        {uni && <Character uni={uni.id} stage={stage} variant={equip ? "equip" : "normal"} size={140} />}
        {error && <div className="tama-error"><span>{error}</span></div>}
        <div className="tama-timer-actions">
          <button
            type="button"
            className="tama-btn"
            disabled={busy}
            onClick={() => run(async () => {
              const fresh = { ...local, pausedMs: 0, pausedAt: null };
              setLocal(fresh);
              saveTimerLocal(uid, fresh);
              await startTimer(uid);
            })}
          >
            <span>スタート</span>
          </button>
        </div>
      </div>
    );
  }

  // ===== 計測中 =====
  const pausedNow = local.pausedAt ? now - local.pausedAt : 0;
  const elapsedMs = Math.max(0, now - startedAt.getTime() - (local.pausedMs || 0) - pausedNow);
  const elapsedMin = Math.floor(elapsedMs / 60000);
  const mm = String(Math.floor(elapsedMs / 60000)).padStart(2, "0");
  const ss = String(Math.floor((elapsedMs % 60000) / 1000)).padStart(2, "0");
  const goal = local.goal || 60;
  const progress = Math.min(1, elapsedMs / (goal * 60000));
  const streak = Math.max(0, Number(profile?.streak) || 0);
  const mult = multiplierText(local.subject, faculty);
  const cat = SUBJECT_CATEGORY[local.subject];
  const expNow = faculty ? expForLog(elapsedMin, cat, faculty.weights, streak) : 0;

  const togglePause = () => {
    if (local.pausedAt) updateLocal({ pausedMs: (local.pausedMs || 0) + (Date.now() - local.pausedAt), pausedAt: null });
    else updateLocal({ pausedAt: Date.now() });
  };

  const finish = () => run(async () => {
    const minutes = Math.min(600, Math.max(5, elapsedMin));
    await stopTimer(uid);
    saveTimerLocal(uid, null);
    onFinish({ subject: local.subject, minutes });
  });

  const quit = () => run(async () => {
    await stopTimer(uid);
    saveTimerLocal(uid, null);
    onClose();
  });

  return (
    <div className="tama tama-timer">
      <div className="tama-timer-top">
        <p className="tama-timer-kicker">
          <span className={`tama-dot ${local.pausedAt ? "paused" : ""}`} />
          <span>{local.pausedAt ? "勉強タイマー 一時停止中" : "勉強タイマー 計測中"}</span>
        </p>
        <Menu timerRunning dark onSettings={onSettings} onKisekae={() => {}} />
      </div>

      <p className="tama-timer-subject"><span>{`${local.subject}（${mult.text}）`}</span></p>

      <div className="tama-ring">
        <svg width="220" height="220" viewBox="0 0 220 220" role="img" aria-label={`目標${goal}分のうち${elapsedMin}分が経過`}>
          <circle cx="110" cy="110" r="96" fill="none" stroke="#34425A" strokeWidth="12" />
          <circle
            cx="110" cy="110" r="96" fill="none" stroke="#F5C842" strokeWidth="12" strokeLinecap="round"
            strokeDasharray={`${(progress * RING).toFixed(1)} ${RING.toFixed(1)}`}
            transform="rotate(-90 110 110)"
          />
        </svg>
        <div className="tama-ring-text">
          <p className="tama-ring-time"><span>{`${mm}:${ss}`}</span></p>
          <p className="tama-ring-goal"><span>{`目標 ${goal}分`}</span></p>
        </div>
      </div>

      <div className="tama-timer-buddy">
        {uni && <Character uni={uni.id} stage={stage} variant={equip ? "equip" : "normal"} size={120} />}
        <div className="tama-bubble">
          <span>いっしょに集中中…</span>
          <br />
          <span className="tama-note">しゃべらずに見守るね</span>
        </div>
      </div>

      <p className="tama-timer-exp">
        <span>いまのEXP </span>
        <strong>{`+${expNow}`}</strong>
        <span>{`（${elapsedMin}分 × ${(1 + mult.w / 100).toFixed(1)} × 連続${streakBonus(streak).toFixed(2)}）`}</span>
      </p>
      <p className="tama-timer-hint">
        <span>記録すると言語化ランクの倍率（S×1.3〜C×1.0）もかかります</span>
      </p>

      {error && <div className="tama-error"><span>{error}</span></div>}

      <div className="tama-timer-actions">
        <button type="button" className="tama-btn outline" onClick={togglePause} disabled={busy}>
          <span>{local.pausedAt ? "再開" : "一時停止"}</span>
        </button>
        <button type="button" className="tama-btn" onClick={finish} disabled={busy}>
          <span>終了して記録</span>
        </button>
      </div>
      {confirmQuit ? (
        <div className="tama-timer-quit">
          <span>記録せずにやめますか？</span>
          <button type="button" className="tama-link light" onClick={quit} disabled={busy}><span>やめる</span></button>
          <button type="button" className="tama-link light" onClick={() => setConfirmQuit(false)}><span>つづける</span></button>
        </div>
      ) : (
        <button type="button" className="tama-link light" onClick={() => setConfirmQuit(true)}>
          <span>記録せずにやめる</span>
        </button>
      )}
    </div>
  );
}
