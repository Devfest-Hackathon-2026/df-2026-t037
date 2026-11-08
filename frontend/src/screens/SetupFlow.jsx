// 初期設定 1/2（学年・受験日・ペース）と 2/2（大学と学部）。デザイン元：docs/design/Setup.dc.html・Select.dc.html
// 保存はバックエンドの POST /plan だけが行う（plan・育成EXPはサーバーが計算する）
import { useMemo, useState } from "react";
import { Character, Egg } from "../characters/Character";
import { UNIVERSITIES, FACULTIES, getFaculty, getUniversity } from "../game/universities";
import { averageMultiplier, makePlan, makeSeason, streakThresholdMinutes } from "../game/rules";
import {
  APP_GRADES, GRADE_FROM_APP, PACES, daysBetween, defaultExamDate, gradeHoursText,
  jpDate, jpMonthDay, milestoneDates, parseYmd, roughDate, round10, todayStart,
} from "../game/display";
import { CATEGORIES } from "../game/subjects";
import { requestPlan } from "../api";
import "./tama.css";

export default function SetupFlow({ profile, defaultNickname, closable, onClose }) {
  const today = useMemo(() => todayStart(), []);
  const initialGrade = APP_GRADES.includes(profile?.grade) ? profile.grade : "高校2年生";
  const [step, setStep] = useState(1);
  const [nickname, setNickname] = useState(profile?.nickname ?? defaultNickname ?? "");
  const [grade, setGrade] = useState(initialGrade);
  const [examDate, setExamDate] = useState(profile?.examDate || defaultExamDate(initialGrade, today));
  const [examEdited, setExamEdited] = useState(Boolean(profile?.examDate));
  const [editingExam, setEditingExam] = useState(false);
  const [pace, setPace] = useState(profile?.pace || "futsuu");
  const initialFaculty = getFaculty(profile?.targetFacultyId) || FACULTIES[0];
  const [uniId, setUniId] = useState(initialFaculty.universityId);
  const [facultyId, setFacultyId] = useState(initialFaculty.id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleGrade = (g) => {
    setGrade(g);
    // 受験日を自分で変えていなければ、学年に合わせて入れ直す
    if (!examEdited) setExamDate(defaultExamDate(g, today));
  };

  const handleUni = (id) => {
    setUniId(id);
    const first = FACULTIES.find((f) => f.universityId === id);
    if (first) setFacultyId(first.id);
  };

  const handleSave = async () => {
    setError("");
    setSaving(true);
    try {
      await requestPlan({ grade, examDate, pace, facultyId, nickname: nickname.trim() });
      onClose();
    } catch (err) {
      setError(err.message || "設定を保存できませんでした。");
      setSaving(false);
    }
  };

  const common = { today, grade, examDate, pace };
  return (
    <div className="tama tama-screen">
      {step === 1 ? (
        <SetupStep
          {...common}
          nickname={nickname}
          onNickname={setNickname}
          onGrade={handleGrade}
          onExamDate={(v) => { setExamDate(v); setExamEdited(true); }}
          editingExam={editingExam}
          onEditExam={() => setEditingExam(true)}
          onPace={setPace}
          closable={closable}
          onClose={onClose}
          onNext={() => setStep(2)}
        />
      ) : (
        <SelectStep
          {...common}
          uniId={uniId}
          facultyId={facultyId}
          onUni={handleUni}
          onFaculty={setFacultyId}
          onBack={() => setStep(1)}
          onSave={handleSave}
          saving={saving}
          error={error}
        />
      )}
    </div>
  );
}

// ===== 初期設定 1/2 =====
function SetupStep({
  today, nickname, onNickname, grade, onGrade, examDate, onExamDate, editingExam, onEditExam,
  pace, onPace, closable, onClose, onNext,
}) {
  const g = GRADE_FROM_APP[grade];
  const exam = parseYmd(examDate);
  const examValid = exam && exam > today;
  const season = examValid ? makeSeason(g, today, exam) : null;
  const paceMeta = PACES.find((p) => p.id === pace) || PACES[1];
  const threshold = Math.round(streakThresholdMinutes(g) / 10) * 10;

  return (
    <>
      <div className="tama-head">
        <div>
          <p className="tama-kicker"><span>初期設定 1/2</span></p>
          <h1 className="tama-title"><span>あなたのことを教えて</span></h1>
        </div>
        <Egg size={72} />
      </div>
      <div className="tama-progress"><div style={{ width: "50%" }} /></div>

      <label className="tama-field">
        <span className="tama-label">ニックネーム（キャラが呼んでくれる）</span>
        <input
          className="tama-input"
          type="text"
          maxLength={20}
          value={nickname}
          onChange={(e) => onNickname(e.target.value)}
        />
      </label>

      <div className="tama-field">
        <p className="tama-label"><span>学年（1日の目安とシーズンが決まる）</span></p>
        <div className="tama-row">
          {APP_GRADES.map((value) => (
            <button
              key={value}
              type="button"
              className={`tama-pill ${grade === value ? "on" : ""}`}
              onClick={() => onGrade(value)}
            >
              <span>{GRADE_FROM_APP[value]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="tama-field">
        <p className="tama-label"><span>受験日（受験学年のシーズンの終わり）</span></p>
        <div className="tama-box tama-exam">
          <div>
            {editingExam ? (
              <input
                className="tama-input tama-date"
                type="date"
                value={examDate}
                onChange={(e) => onExamDate(e.target.value)}
              />
            ) : (
              <p className="tama-strong"><span>{exam ? jpDate(exam) : "未設定"}</span></p>
            )}
            <p className="tama-note"><span>学年から自動で入力（国公立2次・前期）</span></p>
          </div>
          <div className="tama-exam-side">
            {examValid && <p className="tama-badge"><span>{`あと${daysBetween(today, exam)}日`}</span></p>}
            {!editingExam && (
              <button type="button" className="tama-link" onClick={onEditExam}>
                <span>変更する</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="tama-field">
        <p className="tama-label"><span>ペース（あとから変えられる）</span></p>
        <div className="tama-grid3">
          {PACES.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`tama-pace ${pace === p.id ? "on" : ""}`}
              onClick={() => onPace(p.id)}
            >
              <span className="tama-pace-name" style={{ color: p.color }}>{p.label}</span>
              <span className="tama-note">{p.note}</span>
            </button>
          ))}
        </div>
        <div className="tama-tip">
          <p><strong>{paceMeta.label}</strong><span>{`：${paceMeta.desc}`}</span></p>
          <p><span>{gradeHoursText(g)}</span></p>
          {season && <p><span>{`今シーズン：今日〜${jpDate(season.end)}（${season.days}日）`}</span></p>}
          <p className="tama-muted">
            <span>{`目安の1/4（約${threshold}分）以上の日が続くとEXPが最大×1.20。週1日はおやすみ券で休んでもOK`}</span>
          </p>
        </div>
      </div>

      {!examValid && (
        <div className="tama-error"><span>受験日は今日より後の日付を選んでください。</span></div>
      )}

      <div className="tama-actions">
        {closable && (
          <button type="button" className="tama-btn ghost" onClick={onClose}>
            <span>やめる</span>
          </button>
        )}
        <button type="button" className="tama-btn" disabled={!examValid} onClick={onNext}>
          <span>次へ：志望校を選ぶ</span>
        </button>
      </div>
    </>
  );
}

// ===== 初期設定 2/2 =====
function SelectStep({
  today, grade, examDate, pace, uniId, facultyId, onUni, onFaculty, onBack, onSave, saving, error,
}) {
  const g = GRADE_FROM_APP[grade];
  const uni = getUniversity(uniId);
  const faculty = getFaculty(facultyId);
  const faculties = FACULTIES.filter((f) => f.universityId === uniId);

  const preview = useMemo(() => {
    const examDay = parseYmd(examDate);
    if (!faculty || !examDay || examDay <= today) return null;
    const plan = makePlan({ grade: g, start: today, examDate: examDay, faculty, pace });
    const dates = milestoneDates(g, today, examDay);
    return { plan, dates };
  }, [g, examDate, faculty, pace, today]);

  const weighted = CATEGORIES.filter((c) => (faculty?.weights[c.id] ?? 0) > 0).map((c) => c.label);
  const ribbon = faculty?.ribbon;

  return (
    <>
      <div>
        <p className="tama-kicker"><span>初期設定 2/2</span></p>
        <h1 className="tama-title"><span>どこをめざす？</span></h1>
      </div>

      <p className="tama-label"><span>1. 大学を選ぶ（キャラが決まる）</span></p>
      <div className="tama-unis">
        {UNIVERSITIES.map((u) => (
          <button
            key={u.id}
            type="button"
            className={`tama-uni ${u.id === uniId ? "on" : ""}`}
            onClick={() => onUni(u.id)}
            aria-pressed={u.id === uniId}
          >
            <span
              className="tama-uni-ball"
              style={{ background: `radial-gradient(circle at 38% 30%, ${u.colors[0]} 0%, ${u.colors[1]} 55%, ${u.colors[2]} 100%)` }}
            >
              <span style={{ background: u.id === "keio" ? "#FFFFFF" : "#2B2632" }} />
              <span style={{ background: u.id === "keio" ? "#FFFFFF" : "#2B2632" }} />
            </span>
            <span className="tama-uni-name">{u.short}</span>
          </button>
        ))}
      </div>

      <p className="tama-label"><span>2. 学部・科類を選ぶ（リボンとピンが変わる）</span></p>
      <div className="tama-wrap">
        {faculties.map((f) => {
          const on = f.id === facultyId;
          const style = on && f.ribbon ? { background: f.ribbon.color, borderColor: f.ribbon.dark } : undefined;
          return (
            <button
              key={f.id}
              type="button"
              className={`tama-pill wide ${on ? "on" : ""}`}
              style={style}
              onClick={() => onFaculty(f.id)}
            >
              <span>{f.name}</span>
            </button>
          );
        })}
      </div>

      {uni && faculty && (
        <div className="tama-card tama-preview">
          <div className="tama-preview-ball" style={{ background: uni.colors[0] }}>
            <Character uni={uni.id} stage={3} size={112} />
          </div>
          <div className="tama-preview-text">
            <p className="tama-note strong"><span>{`${uni.name} ${faculty.name}`}</span></p>
            <p className="tama-name"><span>{uni.character}</span></p>
            <p className="tama-small">
              <span>{ribbon ? `最終進化で${ribbon.pinName}のピンとリボン` : "最終進化で学部のリボンがつく"}</span>
              <br />
              <span>{`${weighted.join("・")} 平均×${averageMultiplier(faculty.weights).toFixed(2)}`}</span>
            </p>
          </div>
        </div>
      )}

      {preview && (
        <div className="tama-tip">
          <p className="tama-strong small">
            <span>{`${g}シーズン（〜${jpMonthDay(preview.dates.season.end)}・${preview.dates.season.days}日）の予定`}</span>
          </p>
          <p><span>{gradeHoursText(g)}</span></p>
          <p><span>{`1回目の進化：約${round10(preview.plan.hours.first)}時間（${roughDate(preview.dates.first)}）`}</span></p>
          <p><span>{`最終進化：約${round10(preview.plan.hours.final)}時間（${roughDate(preview.dates.final)}）`}</span></p>
          <p>
            <span>
              {`親密度10：約${round10(preview.plan.hours.bond10)}時間（${roughDate(preview.dates.bond10)}）`}
              {g === "高3" ? "" : " → 4月に図鑑へ"}
            </span>
          </p>
        </div>
      )}

      {error && <div className="tama-error"><span>{error}</span></div>}

      <div className="tama-actions">
        <button type="button" className="tama-btn ghost" onClick={onBack} disabled={saving}>
          <span>もどる</span>
        </button>
        <button type="button" className="tama-btn" onClick={onSave} disabled={saving || !faculty}>
          {saving ? (
            <span key="saving" className="btn-inner"><span className="spinner" /><span>保存中…</span></span>
          ) : (
            <span key="idle">{`${uni?.character ?? "キャラ"}といっしょにがんばる`}</span>
          )}
        </button>
      </div>
    </>
  );
}
