// 冠模試の記録（≡メニュー「模試の記録」）。登録できるのは志望大学の冠模試だけ
// 判定からサーバーが「A判定の王冠」「逆転の翼」「偏差値70の星章」「不死鳥の炎」を決める（progress.mock_unlocks）
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import KANMOSHI from "../game/kanmoshi.json";
import { LEGEND, MYTHIC } from "../game/rules";
import { getFaculty, getUniversity } from "../game/universities";
import { requestDeleteMock, requestSaveMock } from "../api";
import ConfirmDialog from "./ConfirmDialog";
import "./tama.css";

const JUDGES = ["A", "B", "C", "D", "E"];
const JUDGE_COLOR = { A: "#D0607A", B: "#E08A3A", C: "#3FAE7A", D: "#5B8DEF", E: "#8A7A72" };
const ITEM_NAME = Object.fromEntries([...LEGEND, ...MYTHIC].map((x) => [x.id, x.name]));

/** 4月はじまりの年度 */
const fiscalYearOf = (d) => (d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1);

export default function Mocks({ uid, profile, onBack }) {
  const faculty = getFaculty(profile?.targetFacultyId);
  const uni = faculty && getUniversity(faculty.universityId);
  const series = useMemo(() => (uni ? KANMOSHI.universities[uni.id] || [] : []), [uni]);
  const [thisYear] = useState(() => fiscalYearOf(new Date()));

  const [records, setRecords] = useState([]);
  const [seriesId, setSeriesId] = useState(series[0]?.id || "");
  const [year, setYear] = useState(thisYear);
  const [round, setRound] = useState(1);
  const [judge, setJudge] = useState("");
  const [deviation, setDeviation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [removing, setRemoving] = useState(null);

  useEffect(() => {
    if (!uid) return undefined;
    return onSnapshot(
      collection(db, "users", uid, "mocks"),
      (snap) => setRecords(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("[mocks snapshot]", err)
    );
  }, [uid]);

  const current = series.find((s) => s.id === seriesId) || series[0];
  const rounds = current ? Array.from({ length: current.rounds }, (_, i) => i + 1) : [];
  const devOk = deviation === "" || (/^\d{2}(\.\d)?$/.test(deviation) && Number(deviation) >= 20 && Number(deviation) <= 99);
  const canSave = current && judge && devOk && !saving;

  const save = async () => {
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const res = await requestSaveMock({
        seriesId: current.id, fiscalYear: year, round: Math.min(round, current.rounds), judge,
        deviation: deviation === "" ? null : Number(deviation),
      });
      const got = (res.newlyUnlocked || []).map((id) => ITEM_NAME[id]).filter(Boolean);
      setNotice(got.length ? `🎉 ${got.join("・")}を手に入れた！（着替えでつけられます）` : "保存しました");
      setJudge("");
      setDeviation("");
    } catch (err) {
      setError(err.message || "保存できませんでした。");
    } finally {
      setSaving(false);
    }
  };

  // シリーズごとに、年度・回の順で並べる（判定の流れが見えるように）
  const grouped = useMemo(() => {
    const g = {};
    for (const r of records) (g[r.seriesId] ||= []).push(r);
    for (const k of Object.keys(g)) g[k].sort((a, b) => a.fiscalYear - b.fiscalYear || a.round - b.round);
    return Object.entries(g);
  }, [records]);

  const legends = profile?.legends || {};
  const owned = [...LEGEND, ...MYTHIC].filter((x) => legends[x.id]);

  return (
    <div className="tama tama-screen tama-mocks">
      <div className="tama-kise-head">
        <button type="button" className="tama-back" onClick={onBack} aria-label="もどる"><span>‹</span></button>
        <div className="tama-kise-title">
          <h1><span>模試の記録</span></h1>
          <p><span>{uni ? `${uni.name}の冠模試だけ登録できます` : "志望校を決めると登録できます"}</span></p>
        </div>
        <span />
      </div>

      {series.length === 0 ? (
        <div className="tama-box">
          <p className="tama-strong small"><span>{uni ? `${uni.short}の冠模試はありません` : "志望校がまだ決まっていません"}</span></p>
          <p className="tama-note"><span>冠模試（その大学の入試に合わせた模試）がある大学：東大・京大・阪大・一橋・東京科学大・早稲田・慶應</span></p>
        </div>
      ) : (
        <div className="tama-white-card light">
          <p className="tama-label"><span>模試</span></p>
          <div className="tama-mock-series">
            {series.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`tama-pill ${current?.id === s.id ? "on" : ""}`}
                onClick={() => { setSeriesId(s.id); setRound(1); }}
              >
                <span>{s.name}</span>
                <span className="tama-mock-provider">{s.provider}</span>
              </button>
            ))}
          </div>

          <div className="tama-mock-row">
            <label className="tama-field">
              <span className="tama-label">年度</span>
              <select className="tama-input" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                <option value={thisYear}>{`${thisYear}年度（今年度）`}</option>
                <option value={thisYear - 1}>{`${thisYear - 1}年度`}</option>
              </select>
            </label>
            <label className="tama-field">
              <span className="tama-label">回</span>
              <select className="tama-input" value={Math.min(round, rounds.length || 1)} onChange={(e) => setRound(Number(e.target.value))}>
                {rounds.map((r) => (
                  <option key={r} value={r}>{current.rounds === 1 ? "（1回のみ）" : `第${r}回`}</option>
                ))}
              </select>
            </label>
          </div>

          <p className="tama-label"><span>判定</span></p>
          <div className="tama-mock-judges">
            {JUDGES.map((j) => (
              <button
                key={j}
                type="button"
                className={`tama-mock-judge ${judge === j ? "on" : ""}`}
                style={judge === j ? { background: JUDGE_COLOR[j], borderColor: JUDGE_COLOR[j] } : { color: JUDGE_COLOR[j] }}
                onClick={() => setJudge(j)}
                aria-pressed={judge === j}
              >
                <span>{j}</span>
              </button>
            ))}
          </div>

          <label className="tama-field">
            <span className="tama-label">総合偏差値（入れなくてもOK）</span>
            <input
              className="tama-input"
              type="text"
              inputMode="decimal"
              placeholder="例：62.5"
              value={deviation}
              onChange={(e) => setDeviation(e.target.value.trim())}
            />
          </label>
          {!devOk && <p className="tama-field-err"><span>20〜99の数（小数は1けたまで）で入力してね</span></p>}

          {error && <div className="tama-error"><span>{error}</span></div>}
          {notice && <p className="tama-mock-notice" role="status"><span>{notice}</span></p>}
          <button type="button" className="tama-btn block" disabled={!canSave} onClick={save}>
            <span>{saving ? "保存中…" : "この判定を登録する"}</span>
          </button>
          <p className="tama-note"><span>判定と偏差値は自分で入力します。成績表の写真は使わず、保存もしません。同じ模試・年度・回をもう一度登録すると上書きされます</span></p>
        </div>
      )}

      <div className="tama-white-card light">
        <p className="tama-label"><span>手に入れたもの</span></p>
        {owned.length ? (
          <div className="tama-mock-owned">
            {owned.map((x) => <span key={x.id} className="tama-help-chip">{x.name}</span>)}
          </div>
        ) : (
          <p className="tama-note"><span>A判定で「A判定の王冠」、同じ模試で判定を2段階上げると「逆転の翼」、総合偏差値70以上で「偏差値70の星章」、E→Aで「不死鳥の炎」</span></p>
        )}
      </div>

      <div className="tama-white-card light">
        <p className="tama-label"><span>これまでの記録</span></p>
        {grouped.length === 0 && <p className="tama-note"><span>まだ記録がありません</span></p>}
        {grouped.map(([sid, rows]) => (
          <div key={sid} className="tama-mock-history">
            <p className="tama-strong small"><span>{`${rows[0].seriesName}（${rows[0].provider}）`}</span></p>
            <div className="tama-mock-flow">
              {rows.map((r, i) => (
                <span key={r.id} className="tama-mock-step">
                  {i > 0 && <span className="tama-mock-arrow" aria-hidden="true">→</span>}
                  <button type="button" className="tama-mock-chip" onClick={() => setRemoving(r)} aria-label={`${r.fiscalYear}年度 第${r.round}回 ${r.judge}判定（押すと消せます）`}>
                    <span className="tama-mock-badge" style={{ background: JUDGE_COLOR[r.judge] }}>{r.judge}</span>
                    <span>{`${String(r.fiscalYear).slice(2)}年度 第${r.round}回${typeof r.deviation === "number" ? `・偏差値${r.deviation}` : ""}`}</span>
                  </button>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {removing && (
        <ConfirmDialog
          message={`${removing.seriesName} ${removing.fiscalYear}年度 第${removing.round}回（${removing.judge}判定）の記録を消しますか？`}
          confirmLabel="消す"
          onCancel={() => setRemoving(null)}
          onConfirm={async () => {
            const r = removing;
            setRemoving(null);
            try {
              await requestDeleteMock(r.id);
            } catch (err) {
              setError(err.message || "消せませんでした。");
            }
          }}
        />
      )}
    </div>
  );
}
