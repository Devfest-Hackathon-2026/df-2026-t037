// 図鑑（≡メニュー「図鑑」）。4月1日に自然に進級したときに残ったキャラ（users/{uid}/dex/{年度}）を見る。
// 設定から学年を変えたときのキャラは残らない（サーバーの C-25 は図鑑に保存しない）
// タブ：コレクション（9大学×3学年）／思い出カード（1年のまとめ・画像で保存）／進路の軌跡（志望校と模試の流れ）
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { Character, characterSvg } from "../characters/Character";
import { UNIVERSITIES, getFaculty, getUniversity } from "../game/universities";
import { CATEGORIES } from "../game/subjects";
import { APP_GRADES, GRADE_FROM_APP } from "../game/display";
import { buildItems, sanitizeEquipped, wearsUniEquip } from "../game/items";
import "./tama.css";

const TABS = [
  { id: "collection", label: "コレクション" },
  { id: "cards", label: "思い出カード" },
  { id: "path", label: "進路の軌跡" },
];
const JUDGE_COLOR = { A: "#D0607A", B: "#E08A3A", C: "#3FAE7A", D: "#5B8DEF", E: "#8A7A72" };
const MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];

const fiscalYearOf = (d) => (d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1);
const hm = (min) => {
  const m = Math.max(0, Math.round(Number(min) || 0));
  const h = Math.floor(m / 60);
  return h ? `${h}時間${m % 60 ? `${m % 60}分` : ""}` : `${m}分`;
};

/** 図鑑の1件（または育成中のキャラ）を、絵に必要な形にそろえる */
function toCard(src, profile, { current = false } = {}) {
  const faculty = getFaculty(src.facultyId || src.targetFacultyId);
  const uni = faculty && getUniversity(faculty.universityId);
  if (!uni) return null;
  const stage = [1, 2, 3].includes(Number(src.stage)) ? Number(src.stage) : 1;
  const items = buildItems({
    universityId: uni.id, growthExp: src.growthExp, bond: src.bond, legends: profile?.legends,
  });
  const worn = sanitizeEquipped(src.equipped, items);
  return {
    key: current ? "current" : String(src.fiscalYear),
    current,
    fiscalYear: Number(src.fiscalYear),
    grade: src.grade,
    uni,
    faculty,
    stage,
    bond: Number(src.bond) || 0,
    worn,
    variant: stage === 3 && wearsUniEquip(worn, items) ? "equip" : "normal",
    name: uni.stageNames?.[stage - 1] || uni.character,
    stats: src.stats || null,
  };
}

export default function Dex({ uid, profile, onBack }) {
  const [tab, setTab] = useState("collection");
  const [entries, setEntries] = useState([]);
  const [ready, setReady] = useState(false);
  const [mocks, setMocks] = useState([]);
  const [focus, setFocus] = useState(null);

  useEffect(() => {
    if (!uid) return undefined;
    const offDex = onSnapshot(
      collection(db, "users", uid, "dex"),
      (snap) => {
        setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setReady(true);
      },
      (err) => {
        console.error("[dex snapshot]", err);
        setReady(true);
      }
    );
    const offMocks = onSnapshot(
      collection(db, "users", uid, "mocks"),
      (snap) => setMocks(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("[mocks snapshot]", err)
    );
    return () => {
      offDex();
      offMocks();
    };
  }, [uid]);

  const cards = useMemo(
    () => entries.map((e) => toCard(e, profile)).filter(Boolean).sort((a, b) => b.fiscalYear - a.fiscalYear),
    [entries, profile]
  );
  const current = useMemo(() => {
    if (!profile?.plan || profile?.seasonEnded) return null;
    return toCard({ ...profile, fiscalYear: fiscalYearOf(new Date()) }, profile, { current: true });
  }, [profile]);

  const openCard = (key) => {
    setFocus(key);
    setTab("cards");
  };

  return (
    <div className="tama tama-screen tama-dex">
      <div className="tama-kise-head">
        <button type="button" className="tama-back" onClick={onBack} aria-label="もどる"><span>‹</span></button>
        <div className="tama-kise-title">
          <h1><span>図鑑</span></h1>
          <p><span>4月に進級したとき、その年のキャラがここに残ります</span></p>
        </div>
        <span />
      </div>

      <div className="tama-help-tabs tama-dex-tabs" role="tablist">
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

      {!ready ? (
        <div className="tama-dex-loading"><div className="spinner dark" /></div>
      ) : tab === "collection" ? (
        <Collection cards={cards} current={current} onOpen={openCard} />
      ) : tab === "cards" ? (
        <Memories cards={cards} current={current} mocks={mocks} focus={focus} />
      ) : (
        <Trajectory cards={cards} current={current} mocks={mocks} />
      )}
    </div>
  );
}

// ===== コレクション：9大学 × 3学年 =====
function Collection({ cards, current, onOpen }) {
  const got = new Map();
  for (const c of cards) {
    const k = `${c.uni.id}/${c.grade}`;
    // 同じ大学・学年が2つあれば、育ったほう（進化の段階が上）を出す
    if (!got.has(k) || got.get(k).stage < c.stage) got.set(k, c);
  }
  const total = UNIVERSITIES.length * APP_GRADES.length;

  return (
    <div className="tama-white-card light">
      <div className="tama-dex-count">
        <p className="tama-label"><span>あつめたキャラ</span></p>
        <p className="tama-dex-num"><span>{got.size}</span><span className="tama-dex-of">{` / ${total}`}</span></p>
      </div>
      <div className="tama-dex-meter"><div style={{ width: `${(got.size / total) * 100}%` }} /></div>
      <p className="tama-note">
        <span>学年で見た目が変わります：高1はそのまま、高2は学年章のバッジ、高3は必勝の鉢巻。設定から学年を変えたときのキャラは残りません</span>
      </p>

      <div className="tama-dex-grid" role="table" aria-label="大学と学年のコレクション">
        <div className="tama-dex-row head" role="row">
          <span role="columnheader" />
          {APP_GRADES.map((g) => <span key={g} role="columnheader" className="tama-dex-gh">{GRADE_FROM_APP[g]}</span>)}
        </div>
        {UNIVERSITIES.map((u) => (
          <div key={u.id} className="tama-dex-row" role="row">
            <span role="rowheader" className="tama-dex-uni">{u.short}</span>
            {APP_GRADES.map((g) => {
              const c = got.get(`${u.id}/${g}`);
              const now = !c && current && current.uni.id === u.id && current.grade === g ? current : null;
              if (c) {
                return (
                  <button key={g} type="button" role="cell" className="tama-dex-cell is-got" onClick={() => onOpen(c.key)}
                    aria-label={`${u.short} ${GRADE_FROM_APP[g]} ${c.name}（${c.fiscalYear}年度）`}>
                    <Character uni={u.id} stage={c.stage} variant={c.variant} size={64} still faculty={c.faculty} wear={c.worn} grade={g} />
                    <span className="tama-dex-cell-name">{u.character}</span>
                  </button>
                );
              }
              if (now) {
                return (
                  <button key={g} type="button" role="cell" className="tama-dex-cell is-now" onClick={() => onOpen("current")}
                    aria-label={`${u.short} ${GRADE_FROM_APP[g]} 育成中`}>
                    <Character uni={u.id} stage={now.stage} variant={now.variant} size={64} still faculty={now.faculty} wear={now.worn} grade={g} />
                    <span className="tama-dex-cell-tag">育成中</span>
                  </button>
                );
              }
              return (
                <div key={g} role="cell" className="tama-dex-cell is-empty" aria-label={`${u.short} ${GRADE_FROM_APP[g]} まだ`}>
                  <Character uni={u.id} stage={3} size={64} still className="tama-dex-shadow" />
                  <span className="tama-dex-cell-name">？？？</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== 思い出カード =====
function Memories({ cards, current, mocks, focus }) {
  useEffect(() => {
    if (!focus) return;
    document.getElementById(`dex-card-${focus}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focus]);

  return (
    <>
      {current && <MemoryCard card={current} mocks={mocks} />}
      {cards.length === 0 && (
        <div className="tama-box">
          <p className="tama-strong small"><span>まだ思い出カードはありません</span></p>
          <p className="tama-note">
            <span>4月1日に自然に進級すると、その1年のキャラと「勉強時間・続いた日数・いちばんの振り返り・模試」がカードになってここに残ります</span>
          </p>
        </div>
      )}
      {cards.map((c) => <MemoryCard key={c.key} card={c} mocks={mocks} />)}
    </>
  );
}

function yearMocks(mocks, fy) {
  return mocks
    .filter((m) => Number(m.fiscalYear) === fy)
    .sort((a, b) => String(a.seriesId).localeCompare(String(b.seriesId)) || a.round - b.round);
}

function MemoryCard({ card, mocks }) {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const s = card.stats;
  const ym = yearMocks(mocks, card.fiscalYear);
  const monthly = monthlyBars(s, card.fiscalYear);
  const best = s?.bestReflection;

  const save = async () => {
    setSaving(true);
    setMsg("");
    try {
      const res = await saveCardImage(card, ym);
      setMsg(res === "shared" ? "共有しました" : "画像を保存しました");
    } catch (err) {
      if (err?.name !== "AbortError") {
        console.error("[dex image]", err);
        setMsg("画像を作れませんでした");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id={`dex-card-${card.key}`} className={`tama-dex-card ${card.current ? "is-current" : ""}`}>
      <div className="tama-dex-card-top" style={{ background: `linear-gradient(160deg, ${card.uni.colors[0]}, ${card.uni.colors[1]})` }}>
        <div className="tama-dex-card-meta">
          <span className="tama-dex-year">{`${card.fiscalYear}年度`}</span>
          <span className="tama-dex-grade">{card.grade || ""}</span>
          {card.current && <span className="tama-dex-now">育成中</span>}
        </div>
        <Character uni={card.uni.id} stage={card.stage} variant={card.variant} size={150} faculty={card.faculty} wear={card.worn} grade={card.grade} />
        <p className="tama-dex-card-name"><span>{card.name}</span></p>
        <p className="tama-dex-card-sub"><span>{`${card.uni.name} ${card.faculty.name}`}</span></p>
        {card.stage === 3 && (
          <p className="tama-dex-hearts" aria-label={`親密度 ${card.bond}/10`}>
            {Array.from({ length: 10 }, (_, i) => <span key={i} className={i < card.bond ? "on" : ""}>♥</span>)}
          </p>
        )}
      </div>

      {card.current ? (
        <p className="tama-note tama-dex-pad">
          <span>今の1年がおわる（4月1日に進級する）と、ここに勉強時間や振り返りのまとめが入ります</span>
        </p>
      ) : s ? (
        <div className="tama-dex-pad">
          <div className="tama-dex-stats">
            <Stat label="勉強時間" value={hm(s.minutes)} />
            <Stat label="勉強した日" value={`${s.days}日`} />
            <Stat label="最長の連続" value={`${s.bestRun}日`} />
            <Stat label="Sランク" value={`${s.ranks?.S || 0}回`} />
          </div>
          {s.topSubject && (
            <p className="tama-dex-line"><span className="tama-dex-k">いちばん勉強した教科</span><span className="tama-dex-v">{s.topSubject}</span></p>
          )}
          <CategoryBar byCategory={s.byCategory} />
          <div className="tama-dex-months" aria-label="月ごとの勉強時間">
            {monthly.map((m) => (
              <div key={m.month} className="tama-dex-month">
                <div className="tama-dex-month-bar"><div style={{ height: `${m.ratio * 100}%` }} /></div>
                <span>{m.month}</span>
              </div>
            ))}
          </div>
          {best && (
            <blockquote className="tama-dex-quote">
              <p><span>{`「${best.text}」`}</span></p>
              <footer><span>{`${best.date ? best.date.replaceAll("-", "/") : ""} ${best.subject} ・ ${best.rank}ランク`}</span></footer>
            </blockquote>
          )}
        </div>
      ) : (
        <p className="tama-note tama-dex-pad"><span>この年のまとめは記録されていません</span></p>
      )}

      {ym.length > 0 && (
        <div className="tama-dex-pad tama-dex-mocks">
          <p className="tama-label"><span>この年の模試</span></p>
          <MockFlow rows={ym} />
        </div>
      )}

      {!card.current && (
        <div className="tama-dex-pad">
          <button type="button" className="tama-btn block ghost" disabled={saving} onClick={save}>
            <span>{saving ? "画像を作っています…" : "画像で保存"}</span>
          </button>
          {msg && <p className="tama-note" role="status"><span>{msg}</span></p>}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="tama-dex-stat">
      <span className="tama-dex-stat-v">{value}</span>
      <span className="tama-dex-stat-k">{label}</span>
    </div>
  );
}

function CategoryBar({ byCategory }) {
  const rows = CATEGORIES.map((c) => ({ ...c, min: Number(byCategory?.[c.id]) || 0 })).filter((c) => c.min > 0);
  const sum = rows.reduce((a, c) => a + c.min, 0);
  if (!sum) return null;
  return (
    <div className="tama-dex-cat">
      <div className="tama-dex-cat-bar">
        {rows.map((c) => <div key={c.id} style={{ width: `${(c.min / sum) * 100}%`, background: c.color }} title={c.label} />)}
      </div>
      <div className="tama-dex-cat-legend">
        {rows.map((c) => (
          <span key={c.id}><i style={{ background: c.color }} />{`${c.label} ${Math.round((c.min / sum) * 100)}%`}</span>
        ))}
      </div>
    </div>
  );
}

function MockFlow({ rows }) {
  return (
    <div className="tama-mock-flow">
      {rows.map((r, i) => (
        <span key={r.id} className="tama-mock-step">
          {i > 0 && <span className="tama-mock-arrow" aria-hidden="true">→</span>}
          <span className="tama-mock-chip static">
            <span className="tama-mock-badge" style={{ background: JUDGE_COLOR[r.judge] }}>{r.judge}</span>
            <span>{`${r.seriesName || "模試"} 第${r.round}回`}</span>
          </span>
        </span>
      ))}
    </div>
  );
}

function monthlyBars(stats, fy) {
  const vals = MONTHS.map((m) => {
    const y = m >= 4 ? fy : fy + 1;
    return { month: m, min: Number(stats?.monthly?.[`${y}-${String(m).padStart(2, "0")}`]) || 0 };
  });
  const max = Math.max(1, ...vals.map((v) => v.min));
  return vals.map((v) => ({ ...v, ratio: v.min / max }));
}

// ===== 進路の軌跡 =====
function Trajectory({ cards, current, mocks }) {
  const years = [...cards].sort((a, b) => a.fiscalYear - b.fiscalYear);
  if (current) years.push(current);
  const totalMin = cards.reduce((a, c) => a + (Number(c.stats?.minutes) || 0), 0);

  if (years.length === 0) {
    return (
      <div className="tama-box">
        <p className="tama-note"><span>志望校を決めると、ここに1年ずつの歩みがつながっていきます</span></p>
      </div>
    );
  }
  return (
    <div className="tama-white-card light">
      {cards.length > 0 && (
        <p className="tama-dex-line"><span className="tama-dex-k">図鑑に残った年の勉強時間</span><span className="tama-dex-v">{hm(totalMin)}</span></p>
      )}
      <ol className="tama-dex-path">
        {years.map((c, i) => {
          const prev = years[i - 1];
          const changed = prev && prev.faculty.id !== c.faculty.id;
          const ym = yearMocks(mocks, c.fiscalYear);
          return (
            <li key={c.key} className={`tama-dex-step ${c.current ? "is-current" : ""}`}>
              <span className="tama-dex-dot" style={{ background: c.uni.colors[2] }} aria-hidden="true" />
              <div className="tama-dex-step-body">
                <p className="tama-dex-step-head">
                  <span className="tama-dex-year">{`${c.fiscalYear}年度`}</span>
                  <span className="tama-dex-grade">{GRADE_FROM_APP[c.grade] || c.grade || ""}</span>
                  {c.current && <span className="tama-dex-now">いま</span>}
                </p>
                <div className="tama-dex-step-row">
                  <Character uni={c.uni.id} stage={c.stage} variant={c.variant} size={56} still faculty={c.faculty} wear={c.worn} grade={c.grade} />
                  <div>
                    {changed && (
                      <p className="tama-dex-change"><span>{`志望校を変えた：${prev.uni.short} ${prev.faculty.name} → `}</span></p>
                    )}
                    <p className="tama-strong small"><span>{`${c.uni.name} ${c.faculty.name}`}</span></p>
                    <p className="tama-note">
                      <span>{c.current ? `${c.name}を育成中` : `${c.name}・勉強 ${hm(c.stats?.minutes)}`}</span>
                    </p>
                  </div>
                </div>
                {ym.length > 0 && <MockFlow rows={ym} />}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ===== 画像で保存（思い出カードを1枚のPNGにする） =====
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
const FONT = "'Hiragino Maru Gothic ProN','M PLUS Rounded 1c','Yu Gothic',sans-serif";

/** 日本語を1行 n 文字で折り返す（最大 max 行。あふれたら…） */
function wrap(text, n, max) {
  const chars = [...String(text || "")];
  const lines = [];
  for (let i = 0; i < chars.length && lines.length < max; i += n) lines.push(chars.slice(i, i + n).join(""));
  if (chars.length > n * max) lines[max - 1] = `${lines[max - 1].slice(0, -1)}…`;
  return lines;
}

/** 思い出カードの絵（360×640 の SVG 文字列）。キャラはアニメーションなしの1枚絵として入れる */
function cardSvg(card, ym = []) {
  const W = 360;
  const H = 640;
  const s = card.stats || {};
  const [c0, c1, c2] = card.uni.colors;
  const t = (x, y, size, fill, text, { weight = 800, anchor = "middle" } = {}) =>
    `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" font-family="${FONT}">${esc(text)}</text>`;

  const charSvg = characterSvg({ uni: card.uni.id, stage: card.stage, variant: card.variant, faculty: card.faculty, wear: card.worn, grade: card.grade })
    .replace(/^\s*<svg width="100%" height="100%"/, '<svg x="85" y="52" width="190" height="190"');

  const stats = [
    ["勉強時間", hm(s.minutes)],
    ["勉強した日", `${s.days || 0}日`],
    ["最長の連続", `${s.bestRun || 0}日`],
    ["Sランク", `${s.ranks?.S || 0}回`],
  ];
  const statSvg = stats
    .map(([k, v], i) => {
      const x = 24 + (i % 2) * 160;
      const y = 336 + Math.floor(i / 2) * 58;
      return `<rect x="${x}" y="${y}" width="152" height="50" rx="12" fill="#FDF8F4"></rect>` +
        t(x + 76, y + 24, 17, "#4A3A34", v, { weight: 900 }) + t(x + 76, y + 42, 10, "#8A7A72", k);
    })
    .join("");

  const bars = monthlyBars(s, card.fiscalYear);
  const barSvg = bars
    .map((b, i) => {
      const x = 32 + i * 25;
      const h = Math.max(2, b.ratio * 40);
      return `<rect x="${x}" y="${516 - h}" width="15" height="${h}" rx="3" fill="${c2}" opacity="${b.min ? 0.9 : 0.25}"></rect>` +
        t(x + 7.5, 530, 9, "#8A7A72", b.month);
    })
    .join("");

  const best = s.bestReflection;
  const quote = best
    ? wrap(`「${best.text}」`, 22, 2).map((l, i) => t(W / 2, 556 + i * 16, 11.5, "#4A3A34", l, { weight: 700 })).join("")
    : "";
  const mockLine = ym.length
    ? t(W / 2, best ? 596 : 560, 10.5, "#8A7A72", `模試：${ym.map((m) => m.judge).join(" → ")}`)
    : "";

  const hearts = card.stage === 3
    ? Array.from({ length: 10 }, (_, i) => t(W / 2 - 63 + i * 14, 312, 12, i < card.bond ? "#E88AA0" : "#E8DCD6", "♥")).join("")
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<defs><linearGradient id="dexbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c0}"></stop><stop offset="1" stop-color="${c1}"></stop></linearGradient></defs>` +
    `<rect width="${W}" height="${H}" rx="28" fill="#FFF9F5"></rect>` +
    `<rect x="12" y="12" width="${W - 24}" height="${H - 24}" rx="22" fill="#FFFFFF" stroke="${c1}" stroke-width="3"></rect>` +
    `<path d="M12 34 a22 22 0 0 1 22 -22 h${W - 68} a22 22 0 0 1 22 22 v${322 - 34} h-${W - 24} z" fill="url(#dexbg)"></path>` +
    t(30, 44, 13, "#FFFFFF", `${card.fiscalYear}年度`, { anchor: "start", weight: 900 }) +
    `<rect x="${W - 112}" y="28" width="82" height="24" rx="12" fill="#FFFFFF" opacity=".9"></rect>` +
    t(W - 71, 45, 12, c2, card.grade || "", { weight: 900 }) +
    charSvg +
    t(W / 2, 266, 20, "#4A3A34", card.name, { weight: 900 }) +
    t(W / 2, 288, 12, "#6A5A54", `${card.uni.name} ${card.faculty.name}`) +
    hearts +
    statSvg +
    t(W / 2, 466, 10, "#8A7A72", "月ごとの勉強時間（4月→3月）") +
    barSvg +
    quote +
    mockLine +
    t(W / 2, H - 20, 10, "#C9B8B0", "Study Cockpit 図鑑", { weight: 900 }) +
    `</svg>`;
}

async function saveCardImage(card, ym) {
  const svg = cardSvg(card, ym);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("svg load failed"));
      img.src = url;
    });
    const scale = 3;
    const canvas = document.createElement("canvas");
    canvas.width = 360 * scale;
    canvas.height = 640 * scale;
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, 360, 640);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("png failed");
    const fileName = `zukan-${card.fiscalYear}-${card.uni.id}.png`;
    const file = typeof File === "function" ? new File([blob], fileName, { type: "image/png" }) : null;
    // スマホは共有シートから「画像を保存」できる。使えなければダウンロード
    if (file && navigator.canShare?.({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
      await navigator.share({ files: [file], title: `${card.name}（${card.fiscalYear}年度）` });
      return "shared";
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return "saved";
  } finally {
    URL.revokeObjectURL(url);
  }
}
