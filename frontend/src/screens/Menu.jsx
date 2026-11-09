// ホーム右上の灰色の「≡」メニュー（図鑑・設定・着替え）。着替えの入口はここだけ
// 勉強タイマー中は着替えを鍵マークつきで薄く表示し、押せないようにする（Timer.dc.html）
import { useEffect, useRef, useState } from "react";
import { isChimeOn, setChimeOn } from "../lib/chime";
import HelpSheet from "./Help";
import "./tama.css";

export default function Menu({ timerRunning, onSettings, onKisekae, onExplore, onMocks, dark = false }) {
  const [open, setOpen] = useState(false);
  const [chime, setChime] = useState(() => isChimeOn());
  const [helpOpen, setHelpOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const pick = (fn) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div className="tama-menu" ref={ref}>
      <button
        type="button"
        className={`tama-menu-btn ${dark ? "dark" : ""}`}
        aria-label="メニュー（図鑑・着替え・設定）"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>≡</span>
      </button>
      {open && (
        <div className="tama-menu-pop" role="menu">
          <button type="button" role="menuitem" className="tama-menu-item" disabled>
            <span>図鑑</span>
            <span className="tama-menu-sub">じゅんび中</span>
          </button>
          {onExplore && (
            <button type="button" role="menuitem" className="tama-menu-item" onClick={pick(onExplore)}>
              <span>興味から学部をさがす</span>
              <span className="tama-menu-sub">9大学79学部</span>
            </button>
          )}
          {onMocks && (
            <button type="button" role="menuitem" className="tama-menu-item" onClick={pick(onMocks)}>
              <span>模試の記録</span>
              <span className="tama-menu-sub">冠模試の判定</span>
            </button>
          )}
          <button type="button" role="menuitem" className="tama-menu-item" onClick={pick(onSettings)}>
            <span>設定</span>
            <span className="tama-menu-sub">学年・志望校・ペース</span>
          </button>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={chime}
            className="tama-menu-item"
            onClick={() => {
              setChimeOn(!chime);
              setChime(!chime);
            }}
          >
            <span>終わりの音</span>
            <span className={`tama-switch ${chime ? "on" : ""}`} aria-hidden="true"><span /></span>
          </button>
          <button type="button" role="menuitem" className="tama-menu-item" onClick={pick(() => setHelpOpen(true))}>
            <span>ヘルプ</span>
            <span className="tama-menu-sub">育て方・親密度・着替え</span>
          </button>
          <div className="tama-menu-sep" />
          {timerRunning ? (
            <div className="tama-menu-locked" role="menuitem" aria-disabled="true">
              <span className="tama-menu-lockrow">
                <svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true">
                  <rect x="1" y="7" width="12" height="9" rx="2" fill="#8A7A72" />
                  <path d="M3.5 7 V5 a3.5 3.5 0 0 1 7 0 V7" fill="none" stroke="#8A7A72" strokeWidth="2" />
                </svg>
                <span>着替え</span>
              </span>
              <span className="tama-menu-sub">タイマー中はロック。止めると開けます</span>
            </div>
          ) : (
            <button type="button" role="menuitem" className="tama-menu-item" onClick={pick(onKisekae)}>
              <span>着替え</span>
            </button>
          )}
        </div>
      )}
      {helpOpen && <HelpSheet onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
