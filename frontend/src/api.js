// File: frontend/src/api.js
import { auth } from "./firebase";

const API_URL = import.meta.env.VITE_API_URL;

export async function requestAdvice({ subject, minutes, reflection }) {
  const user = auth.currentUser;
  if (!user) throw new Error("ログインが必要です");

  // Firebase IDトークンを取得（期限切れなら自動で更新される）
  const token = await user.getIdToken();

  const res = await fetch(`${API_URL}/advise`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ subject, minutes, reflection }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail =
      typeof body.detail === "string" ? body.detail : `エラー (${res.status})`;
    throw new Error(detail);
  }
  return res.json();
}