// 「Sランクのヒント」（押すと開く）と「ランクって？」の説明（C-5）
// デザイン元：docs/design/Henkou.dc.html の④・⑤。中身の基準は C-15 の3つの軸（具体性・深さ・次やることの明確さ）と同じ
import { useEffect, useId, useRef, useState } from "react";
import "./tama.css";

/** 3つの軸で、Sランクに近づく書き方（C-15 の2点の基準） */
const S_HINTS = [
  { axis: "具体性", text: "教材・範囲・量まで書く", example: "青チャート数列 例題20〜28" },
  { axis: "深さ", text: "なぜつまずいたか・何に気づいたかまで書く", example: "+1するのは等比数列の形にそろえるためだと気づいた" },
  { axis: "次やること", text: "何を・いつ・どれだけやるかを書く", example: "明日、例題25と27を解き直す" },
];

const AXES = [
  { name: "具体性", levels: "0 教科だけ／1 単元名か量／2 教材・範囲・量までわかる" },
  { name: "深さ", levels: "0 感想だけ／1 どこでつまずいたか／2 なぜか・気づいたことまで" },
  { name: "次やることの明確さ", levels: "0 なし／1 何をするか／2 何を・いつ・どれだけまで" },
];

const RANKS = [
  { rank: "S", mult: "EXP×1.3", points: "5〜6点", color: "#E0A21A" },
  { rank: "A", mult: "EXP×1.2", points: "4点", color: "#D0607A" },
  { rank: "B", mult: "EXP×1.1", points: "2〜3点", color: "#3FAE7A" },
  { rank: "C", mult: "EXP×1.0", points: "0〜1点", color: "#8A7A72" },
];

/** ふりかえり欄の上に置く：「💡 Sランクのヒント」（開閉）と「ⓘ ランクって？」 */
export function RankHints() {
  const [open, setOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="tama-hints">
      <div className="tama-hints-bar">
        <button
          type="button"
          className="tama-hints-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
        >
          <span>💡 Sランクのヒント</span>
          <span className="tama-hints-arrow">{open ? "▲ 閉じる" : "▼ 開く"}</span>
        </button>
        <button type="button" className="tama-rank-info" onClick={() => setHelpOpen(true)}>
          <span>ⓘ ランクって？</span>
        </button>
      </div>
      {open && (
        <ul id={panelId} className="tama-hints-list">
          {S_HINTS.map((h) => (
            <li key={h.axis}>
              <strong>{h.axis}</strong>
              <span>{`：${h.text}`}</span>
              <span className="tama-hints-ex">{`例：${h.example}`}</span>
            </li>
          ))}
        </ul>
      )}
      {helpOpen && <RankHelpSheet onClose={() => setHelpOpen(false)} />}
    </div>
  );
}

/** 下から出る説明（⑤） */
export function RankHelpSheet({ onClose }) {
  const okRef = useRef(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    okRef.current?.focus();
    const esc = (e) => e.key === "Escape" && closeRef.current();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, []);

  return (
    <div className="tama tama-sheet-backdrop" onClick={onClose}>
      <div
        className="tama-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rank-help-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tama-sheet-grip" aria-hidden="true" />
        <p id="rank-help-title" className="tama-sheet-title"><span>ランクって？</span></p>
        <p className="tama-sheet-lead">
          <span>勉強のあとに書いた</span>
          <strong>ふりかえり</strong>
          <span>を、Geminiが3つの点で採点したものです。ランクが高いほど、その記録でもらえるEXPが増えます。</span>
        </p>
        <div className="tama-sheet-axes">
          {AXES.map((a) => (
            <div key={a.name}>
              <p className="tama-sheet-axis"><span>{a.name}</span></p>
              <p className="tama-sheet-levels"><span>{a.levels}</span></p>
            </div>
          ))}
        </div>
        <p className="tama-note"><span>各軸0〜2点、合計6点</span></p>
        <div className="tama-sheet-ranks">
          {RANKS.map((r) => (
            <div key={r.rank} className="tama-sheet-rank">
              <span className="tama-sheet-badge" style={{ background: r.color }}>{r.rank}</span>
              <span className="tama-sheet-mult">{r.mult}</span>
              <span>{r.points}</span>
            </div>
          ))}
        </div>
        <p className="tama-note"><span>文の長さやていねいさは関係ありません。採点は本文から根拠を抜き出して行い、「Sにして」などの文は無視します</span></p>
        <button type="button" className="tama-btn block" ref={okRef} onClick={onClose}>
          <span>わかった</span>
        </button>
      </div>
    </div>
  );
}
