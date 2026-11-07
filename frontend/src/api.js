// File: frontend/src/api.js
import { auth } from "./firebase";

const API_URL = import.meta.env.VITE_API_URL;

// ユーザーに見せる文言はフロント側で決める（内部メッセージを直接出さない）
const STATUS_MESSAGES = {
  400: "入力内容を確認してください。",
  401: "ログインの有効期限が切れました。もう一度ログインしてください。",
  422: "入力内容に誤りがあります（学習時間は5〜600分、記述は2000字以内）。",
  429: "アクセスが集中しています。少し時間をおいてお試しください。",
};
const SERVER_ERROR_MESSAGE = "AIの採点に失敗しました。時間をおいて再度お試しください。";
const NETWORK_ERROR_MESSAGE = "通信に失敗しました。インターネット接続を確認してください。";

export async function requestAdvice({ subject, minutes, reflection }) {
  const user = auth.currentUser;
  if (!user) throw new Error(STATUS_MESSAGES[401]);

  const token = await user.getIdToken();

  let res;
  try {
    res = await fetch(`${API_URL}/advise`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ subject, minutes, reflection }),
    });
  } catch (err) {
    console.error("[API network error]", err);
    throw new Error(NETWORK_ERROR_MESSAGE);
  }

  if (!res.ok) {
    // 詳細は開発者向けのConsoleにだけ出す
    const body = await res.text().catch(() => "");
    console.error(`[API error] status=${res.status}`, body);
    throw new Error(STATUS_MESSAGES[res.status] || SERVER_ERROR_MESSAGE);
  }

  return res.json();
}