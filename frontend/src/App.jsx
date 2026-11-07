// File: frontend/src/App.jsx
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection, doc, setDoc, query, where, orderBy, limit,
  onSnapshot, serverTimestamp, Timestamp,
} from "firebase/firestore";
import { Chart as ChartJS, ArcElement, Tooltip } from "chart.js";
import { Doughnut } from "react-chartjs-2";
import { auth, db, loginAsGuest, loginWithGoogle } from "./firebase";
import { requestAdvice } from "./api";
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

const GRADES = [
  { value: "高校1年生", note: "本質的理解と学習習慣づくり" },
  { value: "高校2年生", note: "受験基礎の確立と苦手の早期対策" },
  { value: "高校3年生", note: "共通テスト・二次試験の実戦力" },
];

const MINUTE_PRESETS = [15, 30, 45, 60, 90, 120];

const RANK_META = {
  S: { title: "深いメタ認知", className: "rank-s" },
  A: { title: "具体的な言語化", className: "rank-a" },
  B: { title: "事実の記録", className: "rank-b" },
  C: { title: "もう一歩具体的に", className: "rank-c" },
};

const S_TIPS = ["なぜその公式になる？", "他の単元とのつながり", "ミスの本当の原因"];
const GOOD_LENGTH = 80;
const EXP_PER_LEVEL = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

// ===== ユーティリティ =====
function formatMinutes(total) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}分`;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

function formatDate(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function daysAgo(date) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((start - target) / DAY_MS);
}

// ===== ルート =====
export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profileReady, setProfileReady] = useState(false);
  const [gradeEditing, setGradeEditing] = useState(false);
  const [tab, setTab] = useState("record");
  const [logs, setLogs] = useState([]);
  const [lastResult, setLastResult] = useState(null);

  // 認証とプロフィールの監視
  useEffect(() => {
    let unsubProfile = () => {};
    const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
      unsubProfile();
      setUser(currentUser);
      setAuthReady(true);
      setProfile(null);
      setProfileReady(false);
      setLogs([]);
      setLastResult(null);
      if (!currentUser) return;

      unsubProfile = onSnapshot(doc(db, "users", currentUser.uid), (snap) => {
        setProfile(snap.exists() ? snap.data() : null);
        setProfileReady(true);
      });
    });
    return () => {
      unsubProfile();
      unsubAuth();
    };
  }, []);

  // 直近30日の学習ログ
  useEffect(() => {
    if (!user) return;
    const since = Timestamp.fromDate(new Date(Date.now() - 30 * DAY_MS));
    const q = query(
      collection(db, "users", user.uid, "study_logs"),
      where("createdAt", ">=", since),
      orderBy("createdAt", "desc"),
      limit(200)
    );
    return onSnapshot(q, (snapshot) => {
      setLogs(
        snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            dateObj: data.createdAt ? data.createdAt.toDate() : new Date(),
          };
        })
      );
    });
  }, [user]);

  const handleSelectGrade = async (grade) => {
    if (!user) return;
    const data = profile ? { grade } : { grade, createdAt: serverTimestamp() };
    await setDoc(doc(db, "users", user.uid), data, { merge: true });
    setGradeEditing(false);
  };

  if (!authReady) {
    return (
      <div className="splash">
        <div className="spinner dark" />
      </div>
    );
  }

  if (!user) return <LoginScreen />;

  const needGrade = profileReady && !profile?.grade;

  return (
    <div className="app">
      <Header
        grade={profile?.grade}
        onGradeClick={() => setGradeEditing(true)}
      />

      <main className="container main">
        <LevelCard
          totalExp={profile?.totalExp ?? 0}
          userName={user.isAnonymous ? "ゲスト" : user.displayName || user.email}
        />

        <nav className="tabs">
          <button
            className={`tab ${tab === "record" ? "active" : ""}`}
            onClick={() => setTab("record")}
          >
            ✍️ 記録する
          </button>
          <button
            className={`tab ${tab === "report" ? "active" : ""}`}
            onClick={() => setTab("report")}
          >
            📊 レポート
          </button>
        </nav>

        {tab === "record" ? (
          <RecordView lastResult={lastResult} onResult={setLastResult} />
        ) : (
          <ReportView logs={logs} />
        )}
      </main>

      {(needGrade || gradeEditing) && (
        <GradeModal
          current={profile?.grade}
          closable={!needGrade}
          onSelect={handleSelectGrade}
          onClose={() => setGradeEditing(false)}
        />
      )}
    </div>
  );
}

// ===== ログイン画面 =====
function LoginScreen() {
  return (
    <div className="login">
      <div className="card login-card">
        <div className="brand-mark">SC</div>
        <h1 className="login-title">Study Cockpit</h1>
        <p className="login-lead">
          勉強時間ではなく「思考の深さ」を育てる、
          <br />
          高校生のための学習・進路コックピット
        </p>
        <ul className="features">
          <li><span>🧠</span>学びの言語化をAIがS〜Cで採点</li>
          <li><span>📈</span>過去ログから教科の偏りや成長を分析</li>
          <li><span>🎯</span>学年に合わせた受験戦略をアドバイス</li>
        </ul>
        <button className="btn-google" onClick={loginWithGoogle}>
          Google アカウントで始める
        </button>
        <button className="btn-link" onClick={loginAsGuest}>
          ログインせずにゲストで試す
        </button>
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
          <button className="grade-chip" onClick={onGradeClick}>
            {grade || "学年未設定"}
          </button>
          <button className="btn-ghost" onClick={() => signOut(auth)}>
            ログアウト
          </button>
        </div>
      </div>
    </header>
  );
}

// ===== レベルカード（次フェーズでキャラ進化に置き換え） =====
function LevelCard({ totalExp, userName }) {
  const level = Math.floor(totalExp / EXP_PER_LEVEL) + 1;
  const progress = totalExp % EXP_PER_LEVEL;

  return (
    <section className="card level-card">
      <div className="level-avatar">🥚</div>
      <div className="level-body">
        <div className="level-row">
          <span className="level-num">Lv.{level}</span>
          <span className="level-user">{userName}</span>
        </div>
        <div className="level-bar">
          <div
            className="level-bar-fill"
            style={{ width: `${(progress / EXP_PER_LEVEL) * 100}%` }}
          />
        </div>
        <div className="level-meta">
          累計 {totalExp} EXP ・ 次のレベルまで {EXP_PER_LEVEL - progress} EXP
        </div>
      </div>
    </section>
  );
}

// ===== 記録タブ =====
function RecordView({ lastResult, onResult }) {
  const [subject, setSubject] = useState("数学");
  const [minutes, setMinutes] = useState(60);
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
            <div className="field-label">教科</div>
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
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <div className="field-label">学習時間</div>
            <div className="minutes-row">
              {MINUTE_PRESETS.map((m) => (
                <button
                  type="button"
                  key={m}
                  className={`preset ${Number(minutes) === m ? "active" : ""}`}
                  onClick={() => setMinutes(m)}
                >
                  {formatMinutes(m)}
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
                分
              </label>
            </div>
          </div>

          <div className="field">
            <div className="field-label">
              学びの言語化
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
                {length >= GOOD_LENGTH ? "✓ 十分な量です" : `目安 ${GOOD_LENGTH}字`}
                {` ・ ${length}/2000`}
              </span>
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
          {error && <div className="error-box">{error}</div>}
        </form>
      </section>

      {lastResult && <ResultCard result={lastResult} />}
    </>
  );
}

// ===== AI結果カード =====
function ResultCard({ result }) {
  const rank = RANK_META[result.verbal_score] ? result.verbal_score : "C";
  const meta = RANK_META[rank];
  const base = result.base_exp ?? 0;
  const bonus = result.bonus_exp ?? 0;

  return (
    <section className={`card result ${meta.className}`}>
      <div className="result-head">
        <div className={`rank-badge lg ${meta.className}`}>{rank}</div>
        <div>
          <div className="result-label">言語化スコア</div>
          <div className="result-title">{meta.title}</div>
        </div>
        <div className="exp-gain">
          +{base + bonus}
          <span>EXP</span>
          <div className="exp-breakdown">
            時間 +{base} ・ 言語化 +{bonus}
          </div>
        </div>
      </div>

      {result.score_reason && <p className="reason">💡 {result.score_reason}</p>}

      <div className="advice">
        <div className="advice-title">AIメンターからのアドバイス</div>
        <p>{result.advice}</p>
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
        .reduce((sum, l) => sum + (l.minutes || 0), 0);
      const latest = logs.find((l) => l.subject === s.name);
      return { ...s, minutes, lastDays: latest ? daysAgo(latest.dateObj) : null };
    });

    const totalMinutes = subjects.reduce((sum, s) => sum + s.minutes, 0);
    const totalExp = filtered.reduce(
      (sum, l) => sum + (l.base_exp || 0) + (l.bonus_exp || 0), 0
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
              直近{periodDays}日間の教科別学習時間
            </p>
          </div>
          <div className="segmented">
            <button
              className={period === "week" ? "active" : ""}
              onClick={() => setPeriod("week")}
            >
              7日
            </button>
            <button
              className={period === "month" ? "active" : ""}
              onClick={() => setPeriod("month")}
            >
              30日
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
          <div className="chart-area">
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
                        {s.lastDays === null
                          ? "30日以上記録なし"
                          : s.lastDays === 0
                            ? "今日学習"
                            : `${s.lastDays}日前に学習`}
                      </span>
                    </div>
                    <div className="legend-time">
                      {formatMinutes(s.minutes)}
                      <span className="legend-pct">{pct}%</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <div className="empty">この期間の記録はまだありません</div>
        )}
      </section>

      <section className="card">
        <h2 className="card-title">学習ログ</h2>
        <p className="card-sub">{report.filtered.length}件の記録</p>
        {report.filtered.length === 0 ? (
          <div className="empty">記録タブから最初の学びを残しましょう</div>
        ) : (
          <ul className="log-list">
            {report.filtered.map((l) => {
              const rank = RANK_META[l.verbal_score] ? l.verbal_score : null;
              return (
                <li key={l.id} className="log-item">
                  <div className="log-top">
                    <span className="dot" style={{ background: SUBJECT_COLOR[l.subject] }} />
                    <span className="log-subject">{l.subject}</span>
                    <span className="log-meta">
                      {formatDate(l.dateObj)} ・ {formatMinutes(l.minutes || 0)}
                    </span>
                    <span className="log-exp">
                      +{(l.base_exp || 0) + (l.bonus_exp || 0)} EXP
                    </span>
                    {rank && (
                      <span className={`rank-badge ${RANK_META[rank].className}`}>{rank}</span>
                    )}
                  </div>
                  <p className="log-text">{l.reflection}</p>
                  {l.advice && (
                    <details className="log-advice">
                      <summary>AIのアドバイスを見る</summary>
                      <p>{l.advice}</p>
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
        {value}
        {unit && <small>{unit}</small>}
      </div>
    </div>
  );
}

// ===== 学年選択モーダル =====
function GradeModal({ current, closable, onSelect, onClose }) {
  return (
    <div className="modal-backdrop" onClick={closable ? onClose : undefined}>
      <div className="card modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="card-title">学年を選択</h2>
        <p className="card-sub">学年に合わせて、AIのアドバイスと受験戦略が変わります</p>
        <div className="grade-options">
          {GRADES.map((g) => (
            <button
              key={g.value}
              className={`grade-option ${current === g.value ? "active" : ""}`}
              onClick={() => onSelect(g.value)}
            >
              <span>
                {g.value}
                <small>{g.note}</small>
              </span>
              <span>›</span>
            </button>
          ))}
        </div>
        {closable && (
          <button className="btn-link" onClick={onClose} style={{ width: "100%" }}>
            キャンセル
          </button>
        )}
      </div>
    </div>
  );
}