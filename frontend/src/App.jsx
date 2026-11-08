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
import "./App.css";

ChartJS.register(ArcElement, Tooltip);

// ===== 定数 =====
const SUBJECTS = [
  { name: "英語", color: "#3B82F6" },
  { name: "数学", color: "#EF4444" },
  { name: "国語", color: "#F59E0B" },
  { name: "理科", color: "#10B981" },
  { name: "地歴・公民", color: "#F97316" },
  { name: "情報", color: "#8B5CF6" },
];
const SUBJECT_COLOR = Object.fromEntries(SUBJECTS.map((s) => [s.name, s.color]));

const MINUTE_PRESETS = [15, 30, 45, 60, 90, 120];

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
  const [screen, setScreen] = useState("home"); // home / timer / kisekae
  const [tab, setTab] = useState("record");
  const [logs, setLogs] = useState([]);
  const [lastResult, setLastResult] = useState(null);
  const [recordPreset, setRecordPreset] = useState(null);

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
      setRecordPreset(null);
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
  const openSettings = () => setSetupEditing(true);

  // 計測中のタイマーがあれば、再読み込みしてもタイマーの画面にもどる
  if (timerRunning || screen === "timer") {
    return (
      <Timer
        uid={user.uid}
        profile={profile}
        subjects={SUBJECTS.map((s) => s.name)}
        onSettings={openSettings}
        onClose={() => setScreen("home")}
        onFinish={({ subject, minutes }) => {
          setRecordPreset({ subject, minutes, key: Date.now() });
          setLastResult(null);
          setTab("record");
          setScreen("home");
          setTimeout(() => document.getElementById("record-tabs")?.scrollIntoView({ behavior: "smooth" }), 0);
        }}
      />
    );
  }

  if (screen === "kisekae") {
    return <Kisekae uid={user.uid} profile={profile} onBack={() => setScreen("home")} />;
  }

  return (
    <div className="app">
      <Header grade={profile?.grade} onGradeClick={openSettings} />

      <main className="container main">
        <CharacterCard
          profile={profile}
          logs={logs}
          menu={
            <Menu
              timerRunning={timerRunning}
              onSettings={openSettings}
              onKisekae={() => setScreen("kisekae")}
            />
          }
        />

        <div className="tama tama-home-actions">
          <button type="button" className="tama-btn" onClick={() => setScreen("timer")}>
            <span>タイマーで勉強</span>
          </button>
          <button
            type="button"
            className="tama-btn ghost"
            onClick={() => {
              setTab("record");
              document.getElementById("record-tabs")?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            <span>手で記録</span>
          </button>
        </div>

        <nav className="tabs" id="record-tabs">
          <button
            type="button"
            className={`tab ${tab === "record" ? "active" : ""}`}
            onClick={() => setTab("record")}
          >
            <span>✍️ 記録する</span>
          </button>
          <button
            type="button"
            className={`tab ${tab === "report" ? "active" : ""}`}
            onClick={() => setTab("report")}
          >
            <span>📊 レポート</span>
          </button>
        </nav>

        {tab === "record" ? (
          <RecordView
            key={recordPreset?.key ?? "manual"}
            preset={recordPreset}
            lastResult={lastResult}
            onResult={setLastResult}
          />
        ) : (
          <ReportView logs={logs} />
        )}
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
function Header({ grade, onGradeClick }) {
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
          <button type="button" className="grade-chip" onClick={onGradeClick}>
            <span>{grade || "学年未設定"}</span>
          </button>
          <button type="button" className="btn-ghost" onClick={() => signOut(auth)}>
            <span>ログアウト</span>
          </button>
        </div>
      </div>
    </header>
  );
}

// ===== 記録タブ =====
function RecordView({ preset, lastResult, onResult }) {
  // タイマーを終了したときは、その教科と分数を入れた状態で開く
  const [subject, setSubject] = useState(
    preset && SUBJECTS.some((s) => s.name === preset.subject) ? preset.subject : "数学"
  );
  const [minutes, setMinutes] = useState(preset?.minutes ?? 60);
  const [reflection, setReflection] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const length = reflection.trim().length;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!length || loading) return;
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
    <>
      <section className="card">
        <h2 className="card-title">今日の学びを記録</h2>
        <p className="card-sub">何時間やったかより「何が分かったか」がEXPになります</p>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <div className="field-label">
              <span>教科</span>
            </div>
            <div className="subject-grid">
              {SUBJECTS.map((s) => (
                <button
                  type="button"
                  key={s.name}
                  className={`subject-chip ${subject === s.name ? "active" : ""}`}
                  style={{ "--chip-color": s.color }}
                  onClick={() => setSubject(s.name)}
                >
                  <span className="dot" style={{ background: s.color }} />
                  <span>{s.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <div className="field-label">
              <span>学習時間</span>
            </div>
            <div className="minutes-row">
              {MINUTE_PRESETS.map((m) => (
                <button
                  type="button"
                  key={m}
                  className={`preset ${Number(minutes) === m ? "active" : ""}`}
                  onClick={() => setMinutes(m)}
                >
                  <span>{formatMinutes(m)}</span>
                </button>
              ))}
              <label className="minutes-input">
                <input
                  type="number"
                  min="5"
                  max="600"
                  step="5"
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                />
                <span>分</span>
              </label>
            </div>
          </div>

          <div className="field">
            <div className="field-label">
              <span>学びの言語化</span>
              <span className="field-hint">Sランクのヒント</span>
            </div>
            <div className="tips">
              {S_TIPS.map((t) => (
                <span key={t} className="tip">{t}</span>
              ))}
            </div>
            <textarea
              className="textarea"
              value={reflection}
              maxLength={2000}
              onChange={(e) => setReflection(e.target.value)}
              placeholder="例: 加法定理を単位円の図から導出した。cos(α−β)を2点間の距離で表すと、暗記していた式が回転の性質から出てくると分かった。"
            />
            <div className={`counter ${length >= GOOD_LENGTH ? "good" : ""}`}>
              <span>
                {`${length >= GOOD_LENGTH ? "✓ 十分な量です" : `目安 ${GOOD_LENGTH}字`} ・ ${length}/2000`}
              </span>
            </div>
          </div>

          <button type="submit" className="btn-primary" disabled={loading || !length}>
            {loading ? (
              <span key="loading" className="btn-inner">
                <span className="spinner" />
                <span>AIが思考の深さを採点中…</span>
              </span>
            ) : (
              <span key="idle">記録してAIの評価を受け取る</span>
            )}
          </button>

          {error && (
            <div className="error-box">
              <span>{error}</span>
            </div>
          )}
        </form>
      </section>

      {lastResult && <ResultCard result={lastResult} />}
    </>
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
    </section>
  );
}

// ===== レポートタブ =====
function ReportView({ logs }) {
  const [period, setPeriod] = useState("week");
  const periodDays = period === "week" ? 7 : 30;

  const report = useMemo(() => {
    const now = Date.now();
    const filtered = logs.filter((l) => now - l.dateObj.getTime() <= periodDays * DAY_MS);

    const subjects = SUBJECTS.map((s) => {
      const minutes = filtered
        .filter((l) => l.subject === s.name)
        .reduce((sum, l) => sum + toNumber(l.minutes), 0);
      const latest = logs.find((l) => l.subject === s.name);
      return { ...s, minutes, lastDays: latest ? daysAgo(latest.dateObj) : null };
    });

    const totalMinutes = subjects.reduce((sum, s) => sum + s.minutes, 0);
    const totalExp = filtered.reduce(
      (sum, l) => sum + toNumber(l.base_exp) + toNumber(l.bonus_exp),
      0
    );
    const highRank = filtered.filter((l) => ["S", "A"].includes(l.verbal_score)).length;
    const highRate = filtered.length ? Math.round((highRank / filtered.length) * 100) : 0;

    return { filtered, subjects, totalMinutes, totalExp, highRate };
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
          <Stat label="記録回数" value={report.filtered.length} unit="回" />
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
                  <li key={s.name}>
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
            <span>記録タブから最初の学びを残しましょう</span>
          </div>
        ) : (
          <ul className="log-list" key="log-list">
            {report.filtered.map((l) => {
              const rank = RANK_META[l.verbal_score] ? l.verbal_score : null;
              const advice = toText(l.advice);
              return (
                <li key={l.id} className="log-item">
                  <div className="log-top">
                    <span className="dot" style={{ background: SUBJECT_COLOR[l.subject] || "#94a3b8" }} />
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
