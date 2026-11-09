// File: frontend/src/App.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection, doc, query, where, orderBy, limit,
  onSnapshot, Timestamp,
} from "firebase/firestore";
import { Chart as ChartJS, ArcElement, Tooltip } from "chart.js";
import { Doughnut } from "react-chartjs-2";
import { auth, db, loginAsGuest, loginWithGoogle } from "./firebase";
import { requestAdvice, requestRejudge, requestSeasonCheck } from "./api";
import { seasonCheckDue } from "./game/display";
import SetupFlow from "./screens/SetupFlow";
import CharacterCard from "./screens/CharacterCard";
import Menu from "./screens/Menu";
import Timer from "./screens/Timer";
import Kisekae from "./screens/Kisekae";
import { RankBreakdown, RankHints } from "./screens/RankHelp";
import { streakBonus } from "./game/rules";
import Explore from "./screens/Explore";
import Mocks from "./screens/Mocks";
import { CATEGORIES, SUBJECT_GROUPS, SUBJECT_LIST, categoryOfLog, inSeason } from "./game/subjects";
import { SUBJECT_COLORS, colorOfSubject } from "./game/subjectColors";
import { getFaculty, getUniversity } from "./game/universities";
import { newlyUnlockedItems } from "./game/items";
import "./App.css";

ChartJS.register(ArcElement, Tooltip);

// ===== 定数 =====
// 教科は docs/design/Henkou.dc.html ② の並び（game/subjects.js）。色は game/subjectColors.js（C-3）
// レポートは配点カテゴリごとにまとめる（前の記録の「国語」「理科」なども同じカテゴリに入る）
const REPORT_GROUPS = [
  ...CATEGORIES.map((c) => ({ id: c.id, name: c.label, color: c.color })),
  { id: "info", name: "情報", color: SUBJECT_COLORS.情報 },
];
// 前の記録（jpsoc・実技など）も categoryOfLog で今の6教科に読みかえる（C-22）
const reportGroupOf = (log) => categoryOfLog(log) ?? (log?.subject === "情報" ? "info" : null);

const MINUTE_PRESETS = [10, 20, 30, 60];
const MINUTES_MIN = 1;
const MINUTES_MAX = 600;
const isValidMinutes = (v) => /^\d+$/.test(String(v)) && Number(v) >= MINUTES_MIN && Number(v) <= MINUTES_MAX;

const RANK_META = {
  S: { title: "深いメタ認知", className: "rank-s" },
  A: { title: "具体的な言語化", className: "rank-a" },
  B: { title: "事実の記録", className: "rank-b" },
  C: { title: "もう一歩具体的に", className: "rank-c" },
};

const GOOD_LENGTH = 80;
const DAY_MS = 24 * 60 * 60 * 1000;

// ===== ユーティリティ =====
function toText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatMinutes(total) {
  const safe = Math.max(0, Math.round(toNumber(total)));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (h === 0) return `${m}分`;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

function formatDate(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function daysAgo(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((today - target) / DAY_MS);
}

function lastStudiedLabel(days) {
  if (days === null) return "30日以上記録なし";
  if (days === 0) return "今日学習";
  return `${days}日前に学習`;
}

// ===== ルート =====
export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profileReady, setProfileReady] = useState(false);
  const [setupEditing, setSetupEditing] = useState(false);
  const [screen, setScreen] = useState("home"); // home / timer / kisekae / record / result / explore
  const [logs, setLogs] = useState([]);
  // 学習ログの最初の読み込みが終わったか（終わる前に一言を取りに行くと、記録数が0→nと変わって2回取りに行ってしまう）
  const [logsReady, setLogsReady] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  // 進級の確認（C-9）は1回のログインにつき1回だけ。結果はホームのお知らせに出す
  const seasonCheckedFor = useRef(null);
  // 「判定はあとで」の記録の採点し直し（C-15）も、1回のログインにつき1回だけ
  const rejudgedFor = useRef(null);
  const [seasonNotice, setSeasonNotice] = useState(null);

  // 認証とプロフィールの監視
  useEffect(() => {
    let unsubProfile = () => {};
    const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
      unsubProfile();
      unsubProfile = () => {};
      setUser(currentUser);
      setAuthReady(true);
      setProfile(null);
      setProfileReady(false);
      setLogs([]);
      setLogsReady(false);
      setLastResult(null);
      setScreen("home");
      setSetupEditing(false);
      if (!currentUser) return;

      unsubProfile = onSnapshot(
        doc(db, "users", currentUser.uid),
        (snap) => {
          // timerStartedAt はサーバー時刻。書き込み直後も null にならないよう見積もり値を使う
          setProfile(snap.exists() ? snap.data({ serverTimestamps: "estimate" }) : null);
          setProfileReady(true);
        },
        (err) => {
          console.error("[profile listener error]", err);
          setProfileReady(true);
        }
      );
    });
    return () => {
      unsubProfile();
      unsubAuth();
    };
  }, []);

  // 4月1日をこえていそうなら、起動のときに進級の処理をサーバーに頼む（C-9）
  useEffect(() => {
    if (!user || !profileReady || !seasonCheckDue(profile)) return;
    if (seasonCheckedFor.current === user.uid) return;
    seasonCheckedFor.current = user.uid;
    requestSeasonCheck()
      .then((res) => {
        if (res?.season === "promoted") {
          setSeasonNotice(`${res.grade}に進級しました！前のキャラは図鑑に残っています。新しいたまごといっしょにがんばろう`);
        } else if (res?.season === "ended") {
          setSeasonNotice("受験日でシーズンが終わりました。ここまで育てたキャラは図鑑に残っています");
        }
      })
      .catch((err) => {
        // 次の記録のときにもサーバーが同じ処理をするので、ここで失敗しても画面は止めない
        console.error("[season check error]", err);
        seasonCheckedFor.current = null;
      });
  }, [user, profileReady, profile]);

  // 採点に失敗して「判定はあとで」になっている記録があれば、起動のときに採点し直してもらう（C-15）
  useEffect(() => {
    if (!user || !logsReady || !logs.some((l) => l.rankPending)) return;
    if (rejudgedFor.current === user.uid) return;
    rejudgedFor.current = user.uid;
    // 結果は Firestore の記録とプロフィールが変わることで画面に出る。失敗しても次の起動でまた試す
    requestRejudge().catch((err) => console.error("[rejudge error]", err));
  }, [user, logsReady, logs]);

  // 直近30日の学習ログ
  useEffect(() => {
    if (!user) return undefined;
    const since = Timestamp.fromDate(new Date(Date.now() - 30 * DAY_MS));
    const q = query(
      collection(db, "users", user.uid, "study_logs"),
      where("createdAt", ">=", since),
      orderBy("createdAt", "desc"),
      limit(200)
    );
    return onSnapshot(
      q,
      (snapshot) => {
        setLogs(
          snapshot.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              ...data,
              dateObj: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
            };
          })
        );
        setLogsReady(true);
      },
      (err) => {
        console.error("[logs listener error]", err);
        setLogsReady(true);
      }
    );
  }, [user]);

  if (!authReady) {
    return (
      <div className="splash">
        <div className="spinner dark" />
      </div>
    );
  }

  if (!user) return <LoginScreen />;

  if (!profileReady) {
    return (
      <div className="splash">
        <div className="spinner dark" />
      </div>
    );
  }

  // 初期設定（学年・受験日・ペース・志望学部）がまだなら、まず初期設定へ。
  // 学年などの変更も同じ画面から POST /plan を通して保存する（plan を計算し直すため）
  const needSetup = !(profile?.plan && profile?.targetFacultyId);
  if (needSetup || setupEditing) {
    return (
      <SetupFlow
        profile={profile}
        defaultNickname={user.isAnonymous ? "" : user.displayName || ""}
        closable={!needSetup}
        onClose={() => setSetupEditing(false)}
      />
    );
  }

  const timerRunning = Boolean(profile?.timerStartedAt);
  const faculty = getFaculty(profile?.targetFacultyId);
  const characterName = getUniversity(faculty?.universityId)?.character || "キャラ";

  // 学年を変える入口は ≡ メニューの「設定」だけ（C-1）。育成がはじめからになる確認は、学年を変えて保存するときだけ出す（SetupFlow）
  const openSettings = () => setSetupEditing(true);

  // 計測中のタイマーがあれば、再読み込みしてもタイマーの画面にもどる
  if (timerRunning || screen === "timer") {
    return (
      <>
        <Timer
          uid={user.uid}
          profile={profile}
          subjects={SUBJECT_LIST}
          onSettings={openSettings}
          onClose={() => setScreen("home")}
          onRecorded={(result) => {
            setLastResult(result);
            setScreen("result");
          }}
        />
      </>
    );
  }

  if (screen === "explore") {
    return <Explore profile={profile} onBack={() => setScreen("home")} />;
  }

  if (screen === "mocks") {
    return <Mocks uid={user.uid} profile={profile} onBack={() => setScreen("home")} />;
  }

  if (screen === "kisekae") {
    return <Kisekae uid={user.uid} profile={profile} onBack={() => setScreen("home")} />;
  }

  if (screen === "record") {
    return (
      <RecordScreen
        characterName={characterName}
        onResult={(result) => {
          // 記録したら「記録しました」の画面へ（タイマーからの記録と同じ画面。下に「ホームに戻る」）
          setLastResult(result);
          setScreen("result");
        }}
        onBack={() => {
          setLastResult(null);
          setScreen("home");
        }}
      />
    );
  }

  if (screen === "result" && lastResult) {
    return (
      <div className="app">
        <main className="container main">
          <div className="tama tama-subhead">
            <button
              type="button"
              className="tama-back"
              aria-label="ホームへ"
              onClick={() => {
                setLastResult(null);
                setScreen("home");
              }}
            >
              <span>‹</span>
            </button>
            <h1><span>記録しました</span></h1>
          </div>
          <ResultCard result={lastResult} universityId={faculty?.universityId} faculty={faculty} />
          <div className="tama result-actions">
            <button
              type="button"
              className="tama-btn main"
              onClick={() => {
                setLastResult(null);
                setScreen("home");
              }}
            >
              <span aria-hidden="true">🏠</span>
              <span>ホームに戻る</span>
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <Header grade={profile?.grade} />

      <main className="container main">
        {seasonNotice && (
          <div className="tama tama-notice" role="status">
            <span>{seasonNotice}</span>
            <button type="button" className="tama-notice-close" aria-label="お知らせを閉じる" onClick={() => setSeasonNotice(null)}>
              <span>×</span>
            </button>
          </div>
        )}
        <CharacterCard
          profile={profile}
          logs={logs}
          logsReady={logsReady}
          menu={
            <Menu
              timerRunning={timerRunning}
              onSettings={openSettings}
              onKisekae={() => setScreen("kisekae")}
              onExplore={() => setScreen("explore")}
              onMocks={() => setScreen("mocks")}
            />
          }
        />

        {/* C-2：メインの行動（タイマー）と、あとからの記録（文字リンク）を形で分ける */}
        <div className="tama tama-home-actions">
          <button type="button" className="tama-btn main" onClick={() => setScreen("timer")}>
            <span aria-hidden="true">⏱</span>
            <span>タイマーで勉強をはじめる</span>
          </button>
          <button
            type="button"
            className="tama-textlink"
            onClick={() => {
              setLastResult(null);
              setScreen("record");
            }}
          >
            <span>✎ 終わった勉強をあとから記録する</span>
          </button>
        </div>

        {/* 志望校選びを偏差値以外の入口からも：学びたいことから学部をさがす */}
        <button type="button" className="tama tama-explore-entry" onClick={() => setScreen("explore")}>
          <span className="tama-explore-entry-title">興味から学部をさがす</span>
          <span className="tama-explore-entry-sub">学びたいこと・解きたい課題から、9大学79学部を見てみよう</span>
        </button>

        <ReportView logs={logs} profile={profile} />
      </main>
    </div>
  );
}

// ===== ログイン画面 =====
function LoginScreen() {
  const [error, setError] = useState("");

  const handleLogin = async (fn) => {
    setError("");
    try {
      await fn();
    } catch (err) {
      console.error("[login error]", err);
      setError("ログインに失敗しました。もう一度お試しください。");
    }
  };

  return (
    <div className="login">
      <div className="card login-card">
        <div className="brand-mark">SC</div>
        <h1 className="login-title">Study Cockpit</h1>
        <p className="login-lead">
          <span>勉強時間ではなく「思考の深さ」を育てる、</span>
          <br />
          <span>高校生のための学習・進路コックピット</span>
        </p>
        <ul className="features">
          <li><span>🧠</span><span>学びの言語化をAIがS〜Cで採点</span></li>
          <li><span>📈</span><span>過去ログから教科の偏りや成長を分析</span></li>
          <li><span>🎯</span><span>学年に合わせた受験戦略をアドバイス</span></li>
        </ul>
        <button type="button" className="btn-google" onClick={() => handleLogin(loginWithGoogle)}>
          <span>Google アカウントで始める</span>
        </button>
        <button type="button" className="btn-link" onClick={() => handleLogin(loginAsGuest)}>
          <span>ログインせずにゲストで試す</span>
        </button>
        {error && (
          <div className="error-box">
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ===== ヘッダー =====
function Header({ grade }) {
  return (
    <header className="app-header">
      <div className="container header-inner">
        <div className="brand">
          <div className="brand-mark">SC</div>
          <div>
            <div className="brand-title">Study Cockpit</div>
            <div className="brand-sub">学習・進路コックピット</div>
          </div>
        </div>
        <div className="header-right">
          {/* 学年はただの文字（C-1）。変えるときは ≡ メニューの「設定」から */}
          <span className="grade-text">{grade || "学年未設定"}</span>
          <button type="button" className="btn-ghost" onClick={() => signOut(auth)}>
            <span>ログアウト</span>
          </button>
        </div>
      </div>
    </header>
  );
}

// ===== 記録（あとから）：docs/design/Henkou.dc.html ② =====
function RecordScreen({ characterName, onResult, onBack }) {
  const [subject, setSubject] = useState("物理");
  const [minutes, setMinutes] = useState("");
  const [reflection, setReflection] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const length = reflection.trim().length;
  // C-4：1〜600の整数だけ。それ以外は保存ボタンを押せない（Firestoreのルールと同じ範囲）
  const minutesOk = isValidMinutes(minutes);
  const showMinutesError = minutes !== "" && !minutesOk;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!length || !minutesOk || loading) return;
    setLoading(true);
    setError("");
    try {
      const result = await requestAdvice({
        subject,
        minutes: Number(minutes),
        reflection,
      });
      // 教科と分数は、結果カードで育成EXPの式を出すために残す
      onResult({ ...result, subject, minutes: Number(minutes) });
      setReflection("");
    } catch (err) {
      console.error(err);
      setError(err.message || "記録に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <main className="container main tama tama-record">
        <div className="tama-subhead">
          <button type="button" className="tama-back" aria-label="もどる" onClick={onBack}>
            <span>‹</span>
          </button>
          <h1><span>勉強をあとから記録</span></h1>
        </div>

        <form onSubmit={handleSubmit} className="tama-record-form">
          <p className="tama-record-label"><span>教科（1つ選ぶ）</span></p>
          {SUBJECT_GROUPS.map((g) => (
            <div key={g.category} className="tama-subject-row">
              <span className="tama-subject-group" style={{ color: CATEGORIES.find((c) => c.id === g.category)?.color }}>
                {g.label}
              </span>
              {g.items.map((name) => {
                const color = colorOfSubject(name, g.category);
                const on = subject === name;
                return (
                  <button
                    key={name}
                    type="button"
                    className={`tama-subject-chip ${on ? "on" : ""}`}
                    style={on ? { background: color, borderColor: color } : undefined}
                    aria-pressed={on}
                    onClick={() => setSubject(name)}
                  >
                    <span>{name}</span>
                  </button>
                );
              })}
            </div>
          ))}

          <p className="tama-record-label"><span>時間</span></p>
          <div className="tama-minute-presets">
            {MINUTE_PRESETS.map((m) => (
              <button
                type="button"
                key={m}
                className={Number(minutes) === m && minutesOk ? "on" : ""}
                onClick={() => setMinutes(String(m))}
              >
                <span>{`${m}分`}</span>
              </button>
            ))}
          </div>
          <div className="tama-minute-input">
            <label htmlFor="record-minutes"><span>直接入力</span></label>
            <input
              id="record-minutes"
              type="number"
              min={MINUTES_MIN}
              max={MINUTES_MAX}
              step="1"
              inputMode="numeric"
              value={minutes}
              aria-invalid={showMinutesError}
              onChange={(e) => setMinutes(e.target.value)}
            />
            <span>分</span>
            <span className="tama-note">1〜600分・1分単位</span>
          </div>
          {showMinutesError && <p className="tama-field-err"><span>1〜600分で入力してね</span></p>}

          <p className="tama-record-label"><span>ふりかえり</span></p>
          {/* C-5：ヒントは押すと開く。ⓘ でランクの説明 */}
          <RankHints />
          <textarea
            className="tama-textarea"
            value={reflection}
            maxLength={2000}
            onChange={(e) => setReflection(e.target.value)}
            placeholder="例：セミナー物理の運動方程式 基本例題12〜15。糸の張力の向きをまちがえた。明日の朝、例題14を解き直す"
          />
          <div className={`counter ${length >= GOOD_LENGTH ? "good" : ""}`}>
            <span>
              {`${length >= GOOD_LENGTH ? "✓ 十分な量です" : `目安 ${GOOD_LENGTH}字`} ・ ${length}/2000`}
            </span>
          </div>

          {error && (
            <div className="tama-error">
              <span>{error}</span>
            </div>
          )}

          <button type="submit" className="tama-btn block" disabled={loading || !length || !minutesOk}>
            {loading ? (
              <span key="loading" className="btn-inner">
                <span className="spinner" />
                <span>AIが思考の深さを採点中…</span>
              </span>
            ) : (
              <span key="idle">{`記録して${characterName}にEXPをあげる`}</span>
            )}
          </button>
        </form>

      </main>
    </div>
  );
}

// ===== AI結果カード =====
function ResultCard({ result, universityId, faculty }) {
  // 採点に失敗したときは「判定はあとで」（C-15）。EXPは×1.0で先に付け、判定が出たら差分を足す
  const pending = result?.rankPending === true;
  const rawRank = toText(result?.verbal_score);
  const rank = RANK_META[rawRank] ? rawRank : "C";
  const meta = pending ? { title: "判定はあとで", className: "rank-c" } : RANK_META[rank];
  const reason = toText(result?.score_reason);
  const advice = toText(result?.advice);
  const growth = toNumber(result?.growth_exp);
  const evolved = result?.evolved === true;
  const multiplier = toNumber(result?.multiplier) || 1;
  // 時間に対して量が明らかに多すぎる記録（ズルの疑い）：Cランク・育成EXP×0.5・言語化ボーナスなし
  const penalty = !pending && result?.penalty && typeof result.penalty === "object" ? result.penalty : null;
  // 育成EXPの式（デザイン④）：物理60分 × 1.4（理科）× 1.05（連続）× 1.3（S）＝ 115EXP
  const formula = (() => {
    if (pending || growth <= 0 || !faculty || !result?.subject || !result?.minutes) return null;
    const cat = categoryOfLog({ subject: result.subject });
    const w = cat ? faculty.weights?.[cat] ?? 0 : 0;
    const catLabel = CATEGORIES.find((c) => c.id === cat)?.label;
    const streak = toNumber(result?.streak);
    return {
      text: `${result.subject}${result.minutes}分 × ${(1 + w / 100).toFixed(1)}${catLabel ? `（${catLabel}）` : ""} × ${streakBonus(streak).toFixed(2)}（連続）× ${multiplier.toFixed(1)}（${penalty ? "量の確認" : rank}）＝ `,
      growth,
    };
  })();
  // 親密度が上がった・新しい着替えが入手できた（サーバーが返す記録前の値と比べる）
  const oldBond = result?.old_bond;
  const newBond = result?.bond;
  const bondUp = !evolved && typeof oldBond === "number" && typeof newBond === "number" && newBond > oldBond;
  const unlocked =
    universityId && typeof result?.old_growth_total === "number" && typeof result?.growth_total === "number"
      ? newlyUnlockedItems(
          universityId,
          { growthExp: result.old_growth_total, bond: oldBond },
          { growthExp: result.growth_total, bond: newBond }
        )
      : [];
  // G1：過去の似た振り返り（Vertex AI の埋め込み＋Firestore のベクトル検索）から見つけた、くり返しのつまずき
  const recurring = toText(result?.recurring_note);
  const similar = Array.isArray(result?.similar) ? result.similar.slice(0, 3) : [];

  return (
    <section className={`card result ${meta.className}`}>
      <div className="result-head">
        <div className={`rank-badge lg ${meta.className}`}>{pending ? "?" : rank}</div>
        <div>
          <div className="result-label">
            {pending || typeof result?.total !== "number"
              ? "ふりかえりの採点"
              : penalty
                ? `採点 ${result.total}／6点 → 時間と量が合わずC`
                : `ふりかえりの採点 ${result.total}／6点`}
          </div>
          <div className="result-title">
            {pending ? meta.title : `${rank}ランク ×${multiplier.toFixed(1)}`}
          </div>
        </div>
        <div className="exp-gain">
          {/* 画面に出すEXPは、キャラが育つ「育成EXP」だけにそろえる（ゲージ・ログ・集計も同じ） */}
          <span className="exp-gain-num">{`+${growth}`}</span>
          <span>EXP</span>
          <div className="exp-breakdown">
            <span>キャラの育成EXP</span>
          </div>
        </div>
      </div>

      {formula && <p className="result-formula"><span>{formula.text}</span><strong>{`${formula.growth}EXP`}</strong></p>}

      {penalty && (
        <div className="penalty-note" role="status">
          <p className="penalty-title"><span>⚠ 勉強時間に対して、書かれた量が多すぎるようです</span></p>
          <p><span>{`「${toText(penalty.quote)}」— ${toText(penalty.reason)}`}</span></p>
          <p className="penalty-sub">
            <span>{`${toNumber(result?.minutes) ? `${toNumber(result.minutes)}分では` : "この時間では"}こなせない量と判定したので、ランクはC・EXPは半分にしました。実際にやった範囲を正直に書けば、ふつうに採点されます。`}</span>
          </p>
        </div>
      )}

      {!pending && result?.scores && <RankBreakdown scores={result.scores} hint={toText(result?.hint)} />}

      {pending && (
        <p className="reason" role="status">
          <span>AIの採点がまだできていません。あとで自動で判定して、ランクの分のEXPを足します（記録は保存ずみです）</span>
        </p>
      )}

      {evolved && (
        <p className="growth-gain">
          <span>{`🎉 進化した！ キャラに +${growth} EXP`}</span>
        </p>
      )}
      {bondUp && (
        <p className="growth-gain bond-up" role="status">
          <span>{`💗 親密度が${newBond}に上がった！`}</span>
        </p>
      )}
      {unlocked.length > 0 && (
        <p className="growth-gain unlock" role="status">
          <span>{`🎁 新しい着替え：${unlocked.join("・")}（≡メニューの「着替え」でつけられます）`}</span>
        </p>
      )}

      {reason && (
        <p className="reason">
          <span>{`💡 ${reason}`}</span>
        </p>
      )}

      <div className="advice">
        <div className="advice-title">AIメンターからのアドバイス</div>
        <p>
          <span>{advice || "アドバイスを取得できませんでした。"}</span>
        </p>
      </div>

      {recurring && (
        <div className="recurring">
          <div className="advice-title">前の記録とのつながり</div>
          <p><span>{`🔁 ${recurring}`}</span></p>
          {similar.length > 0 && (
            <ul className="recurring-list">
              {similar.map((s, i) => (
                <li key={i}>
                  <span>{`${toText(s.date)} ${toText(s.subject)}${s.rank ? `（${toText(s.rank)}）` : ""}「${toText(s.snippet)}」`}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="recurring-note"><span>意味の近さで、あなたの前の振り返りから見つけました</span></p>
        </div>
      )}
    </section>
  );
}

// ===== レポートタブ =====
function ReportView({ logs, profile }) {
  const [period, setPeriod] = useState("week");
  const periodDays = period === "week" ? 7 : 30;

  const report = useMemo(() => {
    const now = Date.now();
    // 学習ログ（履歴）はシーズンに関係なく出す。時間・EXP・グラフは今のシーズンの記録だけで数える（C-25）
    const filtered = logs.filter((l) => now - l.dateObj.getTime() <= periodDays * DAY_MS);
    const seasonLogs = filtered.filter((l) => inSeason(l, profile));

    // 教科は配点カテゴリ（6教科）＋情報にまとめて表示する
    const subjects = REPORT_GROUPS.map((g) => {
      const minutes = seasonLogs
        .filter((l) => reportGroupOf(l) === g.id)
        .reduce((sum, l) => sum + toNumber(l.minutes), 0);
      const latest = logs.find((l) => inSeason(l, profile) && reportGroupOf(l) === g.id);
      return { ...g, minutes, lastDays: latest ? daysAgo(latest.dateObj) : null };
    });

    const totalMinutes = subjects.reduce((sum, s) => sum + s.minutes, 0);
    const totalExp = seasonLogs.reduce(
      (sum, l) => sum + toNumber(l.growth_exp),
      0
    );
    const highRank = seasonLogs.filter((l) => ["S", "A"].includes(l.verbal_score)).length;
    const highRate = seasonLogs.length ? Math.round((highRank / seasonLogs.length) * 100) : 0;

    return { filtered, seasonCount: seasonLogs.length, subjects, totalMinutes, totalExp, highRate };
  }, [logs, periodDays, profile]);

  const chartData = {
    labels: report.subjects.map((s) => s.name),
    datasets: [
      {
        data: report.subjects.map((s) => s.minutes),
        backgroundColor: report.subjects.map((s) => s.color),
        borderWidth: 3,
        borderColor: "#ffffff",
        hoverOffset: 6,
      },
    ],
  };

  const chartOptions = {
    cutout: "72%",
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: { label: (ctx) => ` ${ctx.label}: ${formatMinutes(ctx.raw)}` },
      },
    },
  };

  return (
    <>
      <section className="card">
        <div className="report-head">
          <div>
            <h2 className="card-title">学習バランス</h2>
            <p className="card-sub" style={{ margin: 0 }}>
              <span>{`直近${periodDays}日間の教科別学習時間`}</span>
            </p>
          </div>
          <div className="segmented">
            <button
              type="button"
              className={period === "week" ? "active" : ""}
              onClick={() => setPeriod("week")}
            >
              <span>7日</span>
            </button>
            <button
              type="button"
              className={period === "month" ? "active" : ""}
              onClick={() => setPeriod("month")}
            >
              <span>30日</span>
            </button>
          </div>
        </div>

        <div className="stats">
          <Stat label="合計時間" value={formatMinutes(report.totalMinutes)} />
          <Stat label="記録回数" value={report.seasonCount} unit="回" />
          <Stat label="獲得EXP" value={report.totalExp} unit="EXP" />
          <Stat label="S・A率" value={report.highRate} unit="%" />
        </div>

        {report.totalMinutes > 0 ? (
          <div className="chart-area" key="chart">
            <div className="doughnut-wrap">
              <Doughnut data={chartData} options={chartOptions} />
              <div className="doughnut-center">
                <div>
                  <span>合計</span>
                  <strong>{formatMinutes(report.totalMinutes)}</strong>
                </div>
              </div>
            </div>

            <ul className="legend">
              {report.subjects.map((s) => {
                const pct = Math.round((s.minutes / report.totalMinutes) * 100);
                const warn = s.lastDays === null || s.lastDays >= 5;
                return (
                  <li key={s.id}>
                    <span className="dot" style={{ background: s.color }} />
                    <div>
                      <span className="legend-name">{s.name}</span>
                      <span className={`legend-last ${warn ? "warn" : ""}`}>
                        {lastStudiedLabel(s.lastDays)}
                      </span>
                    </div>
                    <div className="legend-time">
                      <span>{formatMinutes(s.minutes)}</span>
                      <span className="legend-pct">{`${pct}%`}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <div className="empty" key="empty">
            <span>この期間の記録はまだありません</span>
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="card-title">学習ログ</h2>
        <p className="card-sub">
          <span>{`${report.filtered.length}件の記録`}</span>
        </p>
        {report.filtered.length === 0 ? (
          <div className="empty" key="log-empty">
            <span>タイマーか「あとから記録」で、最初の学びを残しましょう</span>
          </div>
        ) : (
          <ul className="log-list" key="log-list">
            {report.filtered.map((l) => {
              const rank = RANK_META[l.verbal_score] ? l.verbal_score : null;
              const advice = toText(l.advice);
              return (
                <li key={l.id} className="log-item">
                  <div className="log-top">
                    <span className="dot" style={{ background: colorOfSubject(l.subject, categoryOfLog(l)) }} />
                    <span className="log-subject">{toText(l.subject)}</span>
                    <span className="log-meta">
                      {`${formatDate(l.dateObj)} ・ ${formatMinutes(l.minutes)}`}
                    </span>
                    <span className="log-exp">
                      {`+${toNumber(l.growth_exp)} EXP`}
                    </span>
                    {l.rankPending && <span className="rank-badge rank-c">判定待ち</span>}
                    {l.penalty && <span className="rank-badge rank-c" title="勉強時間に対して書かれた量が多すぎたため、ランクCになった記録">量の確認</span>}
                    {rank && (
                      <span className={`rank-badge ${RANK_META[rank].className}`}>{rank}</span>
                    )}
                  </div>
                  <p className="log-text">
                    <span>{toText(l.reflection)}</span>
                  </p>
                  {advice && (
                    <details className="log-advice">
                      <summary>AIのアドバイスを見る</summary>
                      <p>
                        <span>{advice}</span>
                      </p>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

function Stat({ label, value, unit }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        <span>{toText(value)}</span>
        {unit && <small>{unit}</small>}
      </div>
    </div>
  );
}
