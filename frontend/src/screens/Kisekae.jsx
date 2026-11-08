// 着替え（デザイン元：docs/design/Kisekae.dc.html）
// 場所ごとに1つ＋エフェクト1つ。コーデを3つまで保存。勉強タイマー中は変えられない（ルールでも止めている）
import { useMemo, useState } from "react";
import { Character } from "../characters/Character";
import { canChangeOutfit } from "../game/rules";
import { getFaculty, getUniversity } from "../game/universities";
import {
  FILTERS, SLOT_LABEL, buildItems, emptyEquipped, sanitizeEquipped, wearsUniEquip,
} from "../game/items";
import { saveOutfit } from "../game/userWrites";
import "./tama.css";

const OUTFIT_KEYS = ["1", "2", "3"];
const BODY_SLOTS = ["head", "neck", "chest", "hand", "back"];

export default function Kisekae({ uid, profile, onBack }) {
  const faculty = getFaculty(profile?.targetFacultyId);
  const uni = faculty && getUniversity(faculty.universityId);
  const stage = [1, 2, 3].includes(profile?.stage) ? profile.stage : 1;
  const items = useMemo(
    () => buildItems({ universityId: uni?.id, growthExp: profile?.growthExp, bond: profile?.bond }),
    [uni?.id, profile?.growthExp, profile?.bond]
  );
  const saved = sanitizeEquipped(profile?.equipped, items);
  const savedOutfits = profile?.outfits && typeof profile.outfits === "object" ? profile.outfits : {};

  // 書き込み中・書き込み失敗のときも画面が戻らないよう、手元の状態を先に変える
  const [equipped, setEquipped] = useState(saved);
  const [outfits, setOutfits] = useState(savedOutfits);
  const [active, setActive] = useState(
    () => OUTFIT_KEYS.find((k) => JSON.stringify(sanitizeEquipped(savedOutfits[k], items)) === JSON.stringify(saved)) || "1"
  );
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");

  const timerStartedAt = profile?.timerStartedAt ?? null;
  const locked = !canChangeOutfit(timerStartedAt);

  const persist = async (nextEquipped, nextOutfits) => {
    setError("");
    setEquipped(nextEquipped);
    setOutfits(nextOutfits);
    try {
      await saveOutfit(uid, nextEquipped, nextOutfits);
    } catch (err) {
      console.error("[outfit save error]", err);
      setError("着替えを保存できませんでした。もう一度お試しください。");
    }
  };

  const apply = (nextEquipped) => persist(nextEquipped, { ...outfits, [active]: nextEquipped });

  const toggle = (item) => {
    if (locked || !item.owned) return;
    const on = equipped[item.slot] === item.id;
    apply({ ...equipped, [item.slot]: on ? null : item.id });
  };

  const removeAll = () => !locked && apply(emptyEquipped());

  const omakase = () => {
    if (locked) return;
    const next = emptyEquipped();
    // 大学の装備を優先し、空いている場所にほかの入手済みアイテムを入れる
    const owned = items.filter((i) => i.owned).sort((a, b) => Number(Boolean(b.uniEquip)) - Number(Boolean(a.uniEquip)));
    for (const it of owned) if (!next[it.slot]) next[it.slot] = it.id;
    apply(next);
  };

  const selectOutfit = (key) => {
    if (locked) return;
    setActive(key);
    if (outfits[key]) persist(sanitizeEquipped(outfits[key], items), outfits);
  };

  const shown = items.filter((i) => {
    const f = FILTERS.find((x) => x.id === filter);
    return !f?.slots || f.slots.includes(i.slot);
  });
  const normal = shown.filter((i) => i.kind === "normal" && i.slot !== "effect");
  const effects = shown.filter((i) => i.kind === "normal" && i.slot === "effect");
  const legends = shown.filter((i) => i.kind === "legend");
  const wornCount = BODY_SLOTS.filter((s) => equipped[s]).length;
  const wornNames = Object.values(equipped).map((id) => items.find((i) => i.id === id)?.name).filter(Boolean);
  const showEquip = stage === 3 && wearsUniEquip(equipped, items);

  return (
    <div className="tama tama-screen tama-kisekae">
      <div className="tama-kise-head">
        <button type="button" className="tama-back" onClick={onBack} aria-label="もどる"><span>‹</span></button>
        <div className="tama-kise-title">
          <h1><span>着替え</span></h1>
          <p><span>メニューから開く（タイマー中は不可）</span></p>
        </div>
        <span className="tama-kise-count">{`${wornCount}／5`}</span>
      </div>

      {locked && (
        <div className="tama-error"><span>勉強タイマー中は着替えられません。タイマーを止めると開けます。</span></div>
      )}

      <div className="tama-kise-stage">
        {uni && <Character uni={uni.id} stage={stage} variant={showEquip ? "equip" : "normal"} size={150} faculty={faculty} />}
        <div className="tama-kise-tools">
          <button type="button" onClick={removeAll} disabled={locked}><span>ぜんぶ外す</span></button>
          <button type="button" onClick={omakase} disabled={locked}><span>おまかせ</span></button>
        </div>
        <div className="tama-kise-outfits">
          {OUTFIT_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              aria-label={`コーデ${k}`}
              className={active === k ? "on" : ""}
              onClick={() => selectOutfit(k)}
              disabled={locked}
            >
              <span>{k}</span>
            </button>
          ))}
        </div>
        <p className="tama-kise-save"><span>コーデを3つまで保存</span></p>
      </div>
      <p className="tama-note">
        <span>{wornNames.length ? `つけているもの：${wornNames.join("・")}` : "まだ何もつけていません"}</span>
      </p>

      <div className="tama-kise-filters">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={filter === f.id ? "on" : ""}
            onClick={() => setFilter(f.id)}
          >
            <span>{f.label}</span>
          </button>
        ))}
      </div>

      {normal.length > 0 && (
        <div className="tama-kise-grid four">
          {normal.map((it) => <ItemTile key={it.id} item={it} on={equipped[it.slot] === it.id} locked={locked} onClick={() => toggle(it)} />)}
        </div>
      )}

      {effects.length > 0 && (
        <>
          <p className="tama-label"><span>エフェクト（1つ）</span></p>
          <div className="tama-kise-grid five">
            {effects.map((it) => <ItemTile key={it.id} item={it} on={equipped.effect === it.id} locked={locked} onClick={() => toggle(it)} />)}
          </div>
        </>
      )}

      {legends.length > 0 && (
        <>
          <p className="tama-label legend"><span>レジェンド（とても難しい・模試の成績など）</span></p>
          <div className="tama-kise-grid five">
            {legends.map((it) => <ItemTile key={it.id} item={it} on={false} locked onClick={() => {}} />)}
          </div>
        </>
      )}

      {error && <div className="tama-error"><span>{error}</span></div>}
    </div>
  );
}

function ItemTile({ item, on, locked, onClick }) {
  const cls = [
    "tama-item",
    item.kind === "legend" ? "legend" : "",
    item.owned ? "" : "lockedItem",
    on ? "on" : "",
  ].join(" ");
  const label = `${item.name}（${SLOT_LABEL[item.slot]}）${on ? "装備中" : item.owned ? "" : `未入手：${item.note}`}`;
  return (
    <button type="button" className={cls} onClick={onClick} disabled={locked && item.owned} aria-label={label} aria-pressed={on}>
      {on && <span className="tama-item-check">✓</span>}
      {!item.owned && item.kind !== "legend" && <span className="tama-item-lock">ロック</span>}
      <span className="tama-item-slot">{SLOT_LABEL[item.slot]}</span>
      <span className="tama-item-name">{item.name}</span>
      <span className="tama-item-note">{item.note}</span>
    </button>
  );
}
