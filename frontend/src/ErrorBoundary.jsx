// File: frontend/src/ErrorBoundary.jsx
import { Component } from "react";

function makeErrorId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, errorId: null };
  }

  static getDerivedStateFromError(error) {
    return { error, errorId: makeErrorId() };
  }

  componentDidCatch(error, info) {
    // 詳しい内容は開発者向けのConsoleにだけ出す
    console.error(`[UI crash] id=${this.state.errorId}`, error, info.componentStack);
  }

  render() {
    const { error, errorId } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="splash">
        <div className="card" style={{ maxWidth: 420, margin: 20, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🙇</div>
          <h2 className="card-title">画面の表示に失敗しました</h2>
          <p className="card-sub">
            記録は保存されている可能性があります。
            <br />
            お手数ですが、再読み込みしてください。
          </p>

          <button className="btn-primary" onClick={() => window.location.reload()}>
            <span>再読み込み</span>
          </button>

          <p style={{ marginTop: 16, fontSize: 12, color: "#94a3b8" }}>
            <span>エラーID: {errorId}</span>
          </p>

          {import.meta.env.DEV && (
            <pre
              style={{
                marginTop: 12,
                textAlign: "left",
                whiteSpace: "pre-wrap",
                fontSize: 12,
                background: "#fef2f2",
                color: "#dc2626",
                padding: 12,
                borderRadius: 10,
              }}
            >
              {String(error?.message || error)}
            </pre>
          )}
        </div>
      </div>
    );
  }
}