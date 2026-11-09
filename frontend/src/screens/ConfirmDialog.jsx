// 確認ダイアログ（window.confirm は画面が止まるので使わない）
import { useEffect, useRef } from "react";
import "./tama.css";

export default function ConfirmDialog({ message, confirmLabel = "続ける", cancelLabel = "やめる", onConfirm, onCancel }) {
  const okRef = useRef(null);
  const cancelRef = useRef(onCancel);
  useEffect(() => {
    cancelRef.current = onCancel;
  }, [onCancel]);

  // 開いたときに1回だけフォーカスを移し、Escで閉じられるようにする
  useEffect(() => {
    okRef.current?.focus();
    const esc = (e) => e.key === "Escape" && cancelRef.current();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, []);

  return (
    <div className="tama tama-dialog-backdrop" onClick={onCancel}>
      <div
        className="tama-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="tama-dialog-msg"
        onClick={(e) => e.stopPropagation()}
      >
        <p id="tama-dialog-msg" className="tama-dialog-msg"><span>{message}</span></p>
        <div className="tama-dialog-actions">
          <button type="button" className="tama-btn ghost" onClick={onCancel}><span>{cancelLabel}</span></button>
          <button type="button" className="tama-btn" ref={okRef} onClick={onConfirm}><span>{confirmLabel}</span></button>
        </div>
      </div>
    </div>
  );
}
