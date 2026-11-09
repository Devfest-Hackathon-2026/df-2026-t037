// ヘルプ（≡メニュー「ヘルプ」）：育て方・親密度・着替えと装備・模試の記録・ランク
// 数字は rules.js・items.js から取り、説明と実際の計算がずれないようにする
import { useEffect, useRef, useState } from "react";
import { BOND_UNLOCKS, ENDLESS, GRADE_HOURS, LEGEND, MYTHIC, streakThresholdMinutes } from "../game/rules";
import { STREAK_TIERS } from "../game/display";
import { RankHelpSheet } from "./RankHelp";
import "./tama.css";

const TABS = [
  { id: "grow", label: "育て方" },
  { id: "bond", label: "親密度" },
  { id: "outfit", label: "着替え" },
  { id: "mock", label: "模試" },
];

const STREAK_MULT = { 3: "×1.05", 7: "×1.10", 14: "×1.15", 30: "×1.20" };
const man = (n) => `${(n / 10000).toLocaleString("ja-JP")}万`;

function Grow() {
  return (
    <>
      <div className="tama-help-steps">
        {["たまご", "1回目の進化", "最終進化", "親密度10"].map((s, i) => (
          <div key={s} className="tama-help-step">
            <span className="tama-help-num">{i + 1}</span>
            <span>{s}</span>
          </div>
        ))}
      </div>
      <p className="tama-sheet-lead">
        <span>勉強を記録すると、志望校のキャラに</span><strong>育成EXP</strong>
        <span>が入ります。最終進化すると、志望学部のリボンとピンがつきます。</span>
      </p>
      <div className="tama-help-box">
        <p className="tama-help-h"><span>育成EXPの計算</span></p>
        <p className="tama-help-formula"><span>勉強した分数 ×（1＋志望学部の配点の割合）× 連続ボーナス × ふりかえりのランク</span></p>
        <ul className="tama-help-list">
          <li><span>志望学部の配点が大きい教科ほど、多くもらえます（ホームの「配点」カードで確認できます）</span></li>
          <li><span>ふりかえりのランクは S×1.3／A×1.2／B×1.1／C×1.0</span></li>
          <li><span>勉強時間に対して書いた量が明らかに多すぎるときは、ランクC・育成EXPは半分になります</span></li>
        </ul>
      </div>
      <div className="tama-help-box">
        <p className="tama-help-h"><span>連続ボーナス</span></p>
        <p className="tama-help-text">
          <span>{`学年の目安の1/4以上（高1 約${streakThresholdMinutes("高1")}分・高2 約${streakThresholdMinutes("高2")}分・高3 ${streakThresholdMinutes("高3")}分）勉強した日が続くと増えます。`}</span>
        </p>
        <div className="tama-help-chips">
          {STREAK_TIERS.map((d) => (
            <span key={d} className="tama-help-chip">{`${d}日 ${STREAK_MULT[d] || ""}`}</span>
          ))}
        </div>
        <p className="tama-note"><span>週に1日は「おやすみ券」で休んでも連続が切れません。券がない日に休むと連続は半分になります</span></p>
      </div>
      <div className="tama-help-box">
        <p className="tama-help-h"><span>1日の目安と予定</span></p>
        <p className="tama-help-text">
          <span>{`高1 ${GRADE_HOURS.高1}時間・高2 ${GRADE_HOURS.高2}時間・高3 ${GRADE_HOURS.高3}時間（高1・高2は長期休みに1.5倍）。`}</span>
          <span>目安どおりに続けると、シーズンの約1割で1回目の進化、約半分で最終進化、終わりごろに親密度10になるように必要EXPが決まります。</span>
        </p>
        <p className="tama-note"><span>シーズンは高1・高2は3月31日まで、高3は受験日まで。4月1日に進級すると、育てたキャラは図鑑に残り、新しいたまごから始まります</span></p>
      </div>
    </>
  );
}

function Bond() {
  const rows = [
    [3, BOND_UNLOCKS[3], "志望大学の装備（1つ目）がもらえる"],
    [5, BOND_UNLOCKS[5], "志望大学の装備（2つ目）。2つともつけると装備つきの姿になる"],
    [7, BOND_UNLOCKS[7], "エフェクト「金のふち」"],
    [10, BOND_UNLOCKS[10], "エフェクト「ハート」。シーズンの終わりに図鑑へ"],
  ];
  return (
    <>
      <p className="tama-sheet-lead">
        <span>最終進化のあとも勉強を続けると、キャラとの</span><strong>親密度</strong>
        <span>が0から10まで上がります。育成EXPが一定量たまるごとに1つ上がり、記録の結果画面で「親密度が上がった！」とお知らせします。</span>
      </p>
      <div className="tama-help-table">
        {rows.map(([n, name, text]) => (
          <div key={n} className="tama-help-row">
            <span className="tama-help-bond">{`💗${n}`}</span>
            <span>
              <strong>{name}</strong>
              <br />
              <span className="tama-note">{text}</span>
            </span>
          </div>
        ))}
      </div>
      <p className="tama-note">
        <span>親密度はホームのキャラの名前の下と、EXPのバーで確認できます。志望校やペースを変えても、進み具合（%）はそのままです。学年を変えると、はじめからになります</span>
      </p>
    </>
  );
}

function Outfit() {
  return (
    <>
      <p className="tama-sheet-lead">
        <span>着替えは</span><strong>≡メニュー →「着替え」</strong>
        <span>から。頭・首・胸・手・背中に1つずつと、エフェクトを1つつけられます。勉強タイマー中は着替えられません。</span>
      </p>
      <div className="tama-help-box">
        <p className="tama-help-h"><span>つけ方</span></p>
        <ul className="tama-help-list">
          <li><span>アイテムを押すとつく・もう一度押すと外れる。同じ場所のものは入れかわる</span></li>
          <li><span>「おまかせ」で持っているものから自動でコーデ、「ぜんぶ外す」で元にもどる</span></li>
          <li><span>コーデは1〜3に3つまで保存できる</span></li>
          <li><span>「ロック」と出ているものはまだ持っていない。下に入手の条件が書いてある</span></li>
        </ul>
      </div>
      <div className="tama-help-box">
        <p className="tama-help-h"><span>手に入れ方</span></p>
        <ul className="tama-help-list">
          <li><span>志望大学の装備：親密度3と5</span></li>
          <li><span>ほかの大学の装備：その大学のキャラを親密度3・5まで育てると手に入る（図鑑ができたら使えるようになります）</span></li>
          <li><span>{`記念メダル：育成EXP ${man(ENDLESS.medalExp)}・${man(ENDLESS.medalExp * 2)}・${man(ENDLESS.medalExp * 3)}`}</span></li>
          <li><span>{`エフェクト：金のふち（親密度7）・ハート（親密度10）・虹のオーラ（育成EXP ${man(ENDLESS.medalExp * 4)}）`}</span></li>
        </ul>
      </div>
      <div className="tama-help-box is-legend">
        <p className="tama-help-h"><span>レジェンド装備（とても難しい）</span></p>
        <ul className="tama-help-list">
          {LEGEND.map((l) => (
            <li key={l.id}><strong>{l.name}</strong><span>{`：${l.condition}`}</span></li>
          ))}
        </ul>
      </div>
      <div className="tama-help-box is-mythic">
        <p className="tama-help-h"><span>ミシック（最上級のエフェクト）</span></p>
        <ul className="tama-help-list">
          {MYTHIC.map((m) => (
            <li key={m.id}><strong>{m.name}</strong><span>{`：${m.condition}`}</span></li>
          ))}
        </ul>
      </div>
    </>
  );
}

function Mock() {
  return (
    <>
      <p className="tama-sheet-lead">
        <span>志望大学の</span><strong>冠模試</strong>
        <span>（その大学の入試に合わせた模試）を受けたら、≡メニュー →「模試の記録」から判定を登録できます。</span>
      </p>
      <ul className="tama-help-list">
        <li><span>登録できるのは、志望大学の冠模試だけです（ほかの模試は対象外）</span></li>
        <li><span>A判定で「A判定の王冠」、同じ模試シリーズで判定が2段階以上上がると「逆転の翼」、E→Aで「不死鳥の炎」</span></li>
        <li><span>判定・偏差値は自分で入力します。成績表の写真は保存しません</span></li>
      </ul>
    </>
  );
}

export default function HelpSheet({ onClose, initialTab = "grow" }) {
  const [tab, setTab] = useState(initialTab);
  const [rankOpen, setRankOpen] = useState(false);
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
    <>
    <div className="tama tama-sheet-backdrop" onClick={onClose}>
      <div className="tama-sheet tama-help" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={(e) => e.stopPropagation()}>
        <div className="tama-sheet-grip" aria-hidden="true" />
        <div className="tama-help-head">
          <p id="help-title" className="tama-sheet-title"><span>ヘルプ</span></p>
          <button type="button" className="tama-rank-info" onClick={() => setRankOpen(true)}>
            <span>ⓘ ランクって？</span>
          </button>
        </div>
        <div className="tama-help-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`tama-help-tab ${tab === t.id ? "on" : ""}`}
              onClick={() => setTab(t.id)}
            >
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        <div className="tama-help-body" role="tabpanel">
          {tab === "grow" && <Grow />}
          {tab === "bond" && <Bond />}
          {tab === "outfit" && <Outfit />}
          {tab === "mock" && <Mock />}
        </div>
        <button type="button" className="tama-btn block" ref={okRef} onClick={onClose}>
          <span>とじる</span>
        </button>
      </div>
    </div>
    {rankOpen && <RankHelpSheet onClose={() => setRankOpen(false)} />}
    </>
  );
}
