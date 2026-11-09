// 興味から学部をさがす（偏差値ではなく「学びたいこと・解きたい課題」から、9大学79学部を探す）
// 入口は2つ：
//  1. あなたの記録から見つける（G4）：毎日の振り返りのうち、深く考えた記録から興味を見つける。backend/memory.py
//  2. 言葉で探す：学びたいことを書いて探す。backend/explore.py
// 意味の近さ：Vertex AI のテキスト埋め込み／理由：Gemini（学部の紹介文と本人の記録だけを根拠にする）
import { useState } from "react";
import { requestDiscover, requestExplore, requestPlan } from "../api";
import { getUniversity } from "../game/universities";
import ConfirmDialog from "./ConfirmDialog";
import "./tama.css";

const EXAMPLES = [
  "宇宙ごみを減らす技術をつくりたい",
  "人の心がどう動くのか知りたい",
  "病気の人を近くで支えたい",
  "言葉と文化のちがいを学びたい",
  "災害に強いまちをつくりたい",
  "お金や経済のしくみを知りたい",
];
const MIN = 4;
const MAX = 200;

export default function Explore({ profile, onBack }) {
  const [interest, setInterest] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState(null);
  const [safety, setSafety] = useState("");
  const [choosing, setChoosing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");
  const [mode, setMode] = useState(null); // "records"（記録から）/ "words"（言葉で）
  const [themes, setThemes] = useState([]);
  const [shortage, setShortage] = useState(null);

  const text = interest.trim();
  const canSearch = !loading && text.length >= MIN && text.length <= MAX;

  async function discover() {
    if (loading) return;
    setLoading(true);
    setMode("records");
    setError("");
    setSafety("");
    setSaved("");
    setThemes([]);
    setShortage(null);
    try {
      const r = await requestDiscover();
      const list = Array.isArray(r?.results) ? r.results : [];
      if (list.length === 0 && typeof r?.needLogs === "number") {
        setShortage({ used: Number(r.usedLogs) || 0, need: r.needLogs });
        setResults(null);
      } else {
        setResults(list);
        setThemes(Array.isArray(r?.themes) ? r.themes : []);
      }
    } catch (e) {
      setError(e?.message || "うまく探せませんでした。");
    } finally {
      setLoading(false);
    }
  }

  async function search(value = text) {
    if (loading || value.length < MIN) return;
    setLoading(true);
    setMode("words");
    setError("");
    setSafety("");
    setSaved("");
    setThemes([]);
    setShortage(null);
    try {
      const r = await requestExplore({ interest: value });
      if (r?.safety) {
        setSafety(r.message || "");
        setResults([]);
      } else {
        setResults(Array.isArray(r?.results) ? r.results : []);
      }
    } catch (e) {
      setError(e?.message || "うまく探せませんでした。");
    } finally {
      setLoading(false);
    }
  }

  async function choose(item) {
    setSaving(true);
    setError("");
    try {
      // 学年・受験日・ペースはそのまま、志望学部だけを変える（育成の進み具合は保たれる：backend の rescale_growth）
      await requestPlan({
        grade: profile.grade,
        examDate: profile.examDate,
        pace: profile.pace || "futsuu",
        facultyId: item.facultyId,
        nickname: profile.nickname || "",
      });
      setSaved(`${item.university} ${item.faculty}を志望にしました`);
    } catch (e) {
      setError(e?.message || "志望を変えられませんでした。");
    } finally {
      setSaving(false);
      setChoosing(null);
    }
  }

  return (
    <div className="app">
      <main className="container main">
        <div className="tama tama-subhead">
          <button type="button" className="tama-back" aria-label="ホームへ" onClick={onBack}>
            <span>‹</span>
          </button>
          <h1><span>興味から学部をさがす</span></h1>
        </div>

        <section className="tama tama-explore">
          <p className="tama-note">
            <span>
              偏差値ではなく、あなたが深く考えてきたこと・学びたいことから、9大学79学部を大学をまたいで5つ提案します。
            </span>
          </p>

          <div className="tama-card tama-discover">
            <p className="tama-strong"><span>あなたの記録から見つける</span></p>
            <p className="tama-note">
              <span>
                毎日の振り返りのうち、S・Aランクで深く考えた記録や長く取り組んだ記録ほど重く見て、あなたの関心に近い学部を探します。根拠にした振り返りも一緒に表示します。
              </span>
            </p>
            <button type="button" className="tama-btn block" onClick={discover} disabled={loading}>
              <span key={loading && mode === "records" ? "l" : "s"}>
                {loading && mode === "records" ? "記録を読んでいます…" : "記録から見つける"}
              </span>
            </button>
            {shortage && (
              <p className="tama-note tama-discover-short">
                <span>{`振り返りのある記録が${shortage.used}件です。あと${Math.max(1, shortage.need - shortage.used)}件たまると見つけられます。下の「言葉で探す」も試してみてね。`}</span>
              </p>
            )}
          </div>

          <p className="tama-strong small tama-explore-or"><span>または、言葉で探す</span></p>

          <form
            className="tama-explore-form"
            onSubmit={(e) => {
              e.preventDefault();
              search();
            }}
          >
            <label className="tama-strong small" htmlFor="explore-interest">
              <span>学びたいこと・やってみたいこと</span>
            </label>
            <textarea
              id="explore-interest"
              value={interest}
              maxLength={MAX}
              rows={3}
              placeholder="例：海の生き物を守る方法を研究したい／人がなぜ迷うのか知りたい"
              onChange={(e) => setInterest(e.target.value)}
            />
            <div className="tama-explore-examples" aria-label="例">
              {EXAMPLES.map((ex) => (
                <button
                  type="button"
                  key={ex}
                  className="tama-explore-chip"
                  onClick={() => {
                    setInterest(ex);
                    search(ex);
                  }}
                  disabled={loading}
                >
                  <span>{ex}</span>
                </button>
              ))}
            </div>
            <button type="submit" className="tama-btn block" disabled={!canSearch}>
              <span key={loading ? "l" : "s"}>{loading ? "さがしています…" : "さがす"}</span>
            </button>
          </form>

          {error && <p className="tama-chat-error" role="alert"><span>{error}</span></p>}
          {saved && <p className="tama-explore-saved" role="status"><span>{`✓ ${saved}。ホームのキャラと配点が変わります`}</span></p>}
          {safety && (
            <div className="tama-chat-msg char safety tama-explore-safety">
              <span>{safety}</span>
            </div>
          )}

          {mode === "records" && themes.length > 0 && (
            <div className="tama-discover-themes">
              <p className="tama-strong small"><span>あなたの振り返りから見えたテーマ</span></p>
              <div className="tama-explore-keys">
                {themes.map((t) => (
                  <span key={t} className="tama-discover-theme"><span>{t}</span></span>
                ))}
              </div>
            </div>
          )}

          {results && results.length > 0 && (
            <ol className="tama-explore-list">
              {results.map((r, i) => {
                const uni = getUniversity(r.universityId);
                const color = uni?.colors?.[2] || "#8A7A72";
                const current = profile?.targetFacultyId === r.facultyId;
                return (
                  <li key={r.facultyId} className="tama-card tama-explore-card">
                    <div className="tama-explore-top">
                      <span className="tama-explore-rank"><span>{i + 1}</span></span>
                      <div className="tama-explore-name">
                        <p className="tama-tiny" style={{ color }}><span>{r.university}</span></p>
                        <p className="tama-strong"><span>{r.faculty}</span></p>
                      </div>
                      <div className="tama-explore-close" aria-label={`近さ ${r.closeness}`}>
                        <span className="tama-tiny"><span>近さ</span></span>
                        <strong><span>{r.closeness}</span></strong>
                      </div>
                    </div>
                    <div className="tama-bar thin" aria-hidden="true">
                      <div style={{ width: `${r.closeness}%`, background: color }} />
                    </div>
                    {r.reason && <p className="tama-explore-reason"><span>{r.reason}</span></p>}
                    {Array.isArray(r.evidence) && r.evidence.length > 0 && (
                      <div className="tama-discover-evidence">
                        <p className="tama-tiny"><span>根拠にした、あなたの振り返り</span></p>
                        <ul>
                          {r.evidence.map((e, j) => (
                            <li key={j}>
                              <span>{`${e.date} ${e.subject}${e.rank ? `（${e.rank}）` : ""}「${e.snippet}」`}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <p className="tama-explore-summary"><span>{r.summary}</span></p>
                    <div className="tama-explore-keys">
                      {(r.keywords || []).map((k) => (
                        <span key={k} className="tama-explore-key"><span>{k}</span></span>
                      ))}
                    </div>
                    <div className="tama-explore-actions">
                      {!r.reviewed && <span className="tama-explore-badge"><span>チーム確認中</span></span>}
                      <button
                        type="button"
                        className="tama-btn ghost tama-explore-choose"
                        disabled={current || saving}
                        onClick={() => setChoosing(r)}
                      >
                        <span>{current ? "いまの志望" : "この学部をめざす"}</span>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {results && results.length === 0 && !safety && (
            <p className="tama-note"><span>近い学部が見つかりませんでした。言葉を変えて試してみてね。</span></p>
          )}

          <p className="tama-tiny tama-explore-foot">
            <span>
              「記録から見つける」では、あなたの振り返りをAI（Vertex AI・Gemini）が読みます。ほかの人には見えず、振り返りの文章を新しくどこかへ保存することもありません（保存するのは、意味を表す数値＝ベクトルです）。出典：各大学の公式ページ。紹介文はAI（Gemini）が公式ページをもとに下書きしたもので、出典ページが開けるかは自動で確かめています。チームの確認が終わっていないものには「チーム確認中」と出ます。「近さ」は、あなたの言葉と紹介文の意味の近さ（Vertex AI）で、合否や向き不向きを表すものではありません。同じ大学は最大2つまで表示します。最新の情報は必ず各大学の公式ページで確かめてください。
            </span>
          </p>
        </section>
      </main>

      {choosing && (
        <ConfirmDialog
          message={`志望を「${choosing.university} ${choosing.faculty}」に変えますか？学年・受験日・ペースはそのままで、育成の進み具合（%）も保たれます。`}
          confirmLabel={saving ? "変更中…" : "変える"}
          onConfirm={() => !saving && choose(choosing)}
          onCancel={() => !saving && setChoosing(null)}
        />
      )}
    </div>
  );
}
