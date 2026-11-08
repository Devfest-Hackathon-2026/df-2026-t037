// キャラとの会話（ホームの吹き出し＋会話の画面）
// 話す内容の「事実」はサーバー（backend/chat.py）がFirestoreから計算する。画面からは会話の文だけを送る
// 会話は保存しない（画面を閉じると消える）。EXPや記録は変わらない
import { useEffect, useRef, useState } from "react";
import { Character } from "../characters/Character";
import { requestChat, requestGreeting } from "../api";
import "./tama.css";

const MESSAGE_MAX = 300;
const HISTORY_MAX = 8;

/**
 * ホームのキャラの上に出す「一言」。greetingKey（今日の記録数・進化段階）が変わったときだけ取り直す。
 * サーバー側でも同じ状況なら保存した一言を返すので、開くたびにAIを呼ぶことはない
 */
export function GreetingBubble({ greetingKey, color, onTalk, onGreeting }) {
  const [text, setText] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    requestGreeting()
      .then((r) => {
        if (!alive) return;
        const g = typeof r?.greeting === "string" ? r.greeting : "";
        setText(g);
        onGreeting?.(g);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
    // onGreeting は親の関数なので依存に入れない（入れると毎回取り直してしまう）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [greetingKey]);

  return (
    <div className="tama-greet">
      <div className="tama-greet-bubble" style={{ borderColor: color }} aria-live="polite">
        <span>{text || (failed ? "今日もいっしょにがんばろう！" : "…")}</span>
      </div>
      <button type="button" className="tama-greet-talk" style={{ background: color }} onClick={onTalk}>
        <span>話しかける</span>
      </button>
    </div>
  );
}

/** 会話の画面（全面に重ねる）。Escで閉じる */
export function ChatSheet({ uni, stage, faculty, name, greeting, onClose }) {
  const [messages, setMessages] = useState(() => (greeting ? [{ role: "char", text: greeting }] : []));
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    inputRef.current?.focus();
    const esc = (e) => e.key === "Escape" && closeRef.current();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const text = input.trim();
  const canSend = !sending && text.length > 0 && text.length <= MESSAGE_MAX;

  async function send() {
    if (!canSend) return;
    const history = messages.slice(-HISTORY_MAX).map((m) => ({ role: m.role, text: m.text.slice(0, MESSAGE_MAX) }));
    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setError("");
    setSending(true);
    try {
      const r = await requestChat({ message: text, history });
      const reply = typeof r?.reply === "string" ? r.reply : "";
      if (reply) setMessages((prev) => [...prev, { role: "char", text: reply, safety: Boolean(r.safety) }]);
      if (typeof r?.remaining === "number") setRemaining(r.remaining);
    } catch (e) {
      setError(e?.message || "うまく聞きとれなかったみたい。");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="tama tama-chat-backdrop" onClick={onClose}>
      <section
        className="tama-chat"
        role="dialog"
        aria-modal="true"
        aria-label={`${name}と話す`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="tama-chat-head">
          <Character uni={uni.id} stage={stage} size={44} still faculty={faculty} />
          <div className="tama-chat-title">
            <p className="tama-strong"><span>{name}</span></p>
            <p className="tama-tiny"><span>{`${uni.name} ${faculty.name}をめざす相棒`}</span></p>
          </div>
          <button type="button" className="tama-chat-close" onClick={onClose} aria-label="閉じる">
            <span>×</span>
          </button>
        </header>

        <div className="tama-chat-list" ref={listRef}>
          {messages.length === 0 && (
            <p className="tama-note tama-chat-empty">
              <span>{"「今日なにやればいい？」「受験まであと何日？」など、気軽に話しかけてね"}</span>
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`tama-chat-msg ${m.role === "user" ? "me" : "char"}${m.safety ? " safety" : ""}`}>
              <span>{m.text}</span>
            </div>
          ))}
          {sending && (
            <div className="tama-chat-msg char typing" aria-label="考え中">
              <span>…</span>
            </div>
          )}
        </div>

        {error && <p className="tama-chat-error" role="alert"><span>{error}</span></p>}

        <form
          className="tama-chat-form"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            maxLength={MESSAGE_MAX}
            rows={2}
            placeholder={`${name}に話しかける`}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // 日本語の変換を確定するEnterでは送らない。Cmd/Ctrl+Enterで送る
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button type="submit" className="tama-btn" disabled={!canSend}>
            <span>送る</span>
          </button>
        </form>
        <p className="tama-tiny tama-chat-foot">
          <span>
            {`${name}はAI（Gemini）が話しています。まちがえることもあります。名前や住所などの個人情報は書かないでね。`}
            {remaining != null ? ` 今日あと${remaining}回話せます。` : ""}
          </span>
        </p>
      </section>
    </div>
  );
}
