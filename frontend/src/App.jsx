// File: frontend/src/App.jsx
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection, doc, query, where, orderBy, limit,
  onSnapshot, Timestamp,
} from "firebase/firestore";
import { Chart as ChartJS, ArcElement, Tooltip } from "chart.js";
import { Doughnut } from "react-chartjs-2";
import { auth, db, loginAsGuest, loginWithGoogle } from "./firebase";
import { requestAdvice } from "./api";
import SetupFlow from "./screens/SetupFlow";
import CharacterCard from "./screens/CharacterCard";
import Menu from "./screens/Menu";
import Timer from "./screens/Timer";
import Kisekae from "./screens/Kisekae";
import Explore from "./screens/Explore";
import ConfirmDialog from "./screens/ConfirmDialog";
import { CATEGORIES, SUBJECT_GROUPS, SUBJECT_LIST, categoryOfLog, inSeason } from "./game/subjects";
import { SUBJECT_COLORS, colorOfSubject } from "./game/subjectColors";
import { getFaculty, getUniversity } from "./game/universities";
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

const S_TIPS = ["なぜその公式になる？", "他の単元とのつながり", "ミスの本当の原因"];
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
  const [confirmSettings, setConfirmSettings] = useState(false);
  const [logs, setLogs] = useState([]);
  const [lastResult, setLastResult] = useState(null);

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
      setLastResult(null);
      setScreen("home");
      setConfirmSettings(false);
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
      },
      (err) => console.error("[logs listener error]", err)
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

  // 学年を変える入口は ≡ メニューの「設定」だけ（C-1）。予定が作り直されるので、先に確認する
  const settingsDialog = confirmSettings && (
    <ConfirmDialog
      message="学年を変えると、今のキャラと今シーズンの育成がはじめからになります（勉強の記録の履歴は残ります）。変えますか？"
      confirmLabel="設定を開く"
      onConfirm={() => {
        setConfirmSettings(false);
        setSetupEditing(true);
      }}
      onCancel={() => setConfirmSettings(false)}
    />
  );
  const openSettings = () => setConfirmSettings(true);

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
        {settingsDialog}
      </>
    );
  }

  if (screen === "explore") {
    return <Explore profile={profile} onBack={() => setScreen("home")} />;
  }

  if (screen === "kisekae") {
    return <Kisekae uid={user.uid} profile={profile} onBack={() => setScreen("home")} />;
  }

  if (screen === "record") {
    return (
      <RecordScreen
        characterName={characterName}
        lastResult={lastResult}
        onResult={setLastResult}
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
          <ResultCard result={lastResult} />
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <Header grade={profile?.grade} />

      <main className="container main">
        <CharacterCard
          profile={profile}
          logs={logs}
          menu={
            <Menu
              timerRunning={timerRunning}
              onSettings={openSettings}
              onKisekae={() => setScreen("kisekae")}
              onExplore={() => setScreen("explore")}
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
      {settingsDialog}
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
function RecordScreen({ characterName, lastResult, onResult, onBack }) {
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
      onResult(result);
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

          <div className="tama-record-label with-hint">
            <span>ふりかえり</span>
            <span className="tama-note">Sランクのヒント</span>
          </div>
          <div className="tips">
            {S_TIPS.map((t) => (
              <span key={t} className="tip">{t}</span>
            ))}
          </div>
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

        {lastResult && <ResultCard result={lastResult} />}
      </main>
    </div>
  );
}

// ===== AI結果カード =====
function ResultCard({ result }) {
  const rawRank = toText(result?.verbal_score);
  const rank = RANK_META[rawRank] ? rawRank : "C";
  const meta = RANK_META[rank];
  const base = toNumber(result?.base_exp);
  const bonus = toNumber(result?.bonus_exp);
  const reason = toText(result?.score_reason);
  const advice = toText(result?.advice);
  const growth = toNumber(result?.growth_exp);
  const evolved = result?.evolved === true;
  // G1：過去の似た振り返り（Vertex AI の埋め込み＋Firestore のベクトル検索）から見つけた、くり返しのつまずき
  const recurring = toText(result?.recurring_note);
  const similar = Array.isArray(result?.similar) ? result.similar.slice(0, 3) : [];

  return (
    <section className={`card result ${meta.className}`}>
      <div className="result-head">
        <div className={`rank-badge lg ${meta.className}`}>{rank}</div>
        <div>
          <div className="result-label">言語化スコア</div>
          <div className="result-title">{meta.title}</div>
        </div>
        <div className="exp-gain">
          <span className="exp-gain-num">{`+${base + bonus}`}</span>
          <span>EXP</span>
          <div className="exp-breakdown">
            <span>{`時間 +${base} ・ 言語化 +${bonus}`}</span>
          </div>
        </div>
      </div>

      {(growth > 0 || evolved) && (
        <p className="growth-gain">
          <span>{evolved ? `🎉 進化した！ キャラに +${growth} 育成EXP` : `🌱 キャラに +${growth} 育成EXP`}</span>
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
      (sum, l) => sum + toNumber(l.base_exp) + toNumber(l.bonus_exp),
      0
    );
    const highRank = seasonLogs.filter((l) => ["S", "A"].includes(l.verbal_score)).length;
    const highRate = seasonLogs.length ? Math.round((highRank / seasonLogs.length) * 100) : 0;

    return { filtered, seasonCount: seasonLogs.length, subjects, totalMinutes, totalExp, highRate };
  }, [logs, periodDays]);

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
                  <strong>{formatMinutes(report.totalMinutes)}</strong>
                  <span>合計</span>
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
                      {`+${toNumber(l.base_exp) + toNumber(l.bonus_exp)} EXP`}
                    </span>
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
