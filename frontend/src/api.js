// File: frontend/src/api.js
import { auth } from "./firebase";

const API_URL = import.meta.env.VITE_API_URL;

// ユーザーに見せる文言はフロント側で決める（内部メッセージを直接出さない）
const STATUS_MESSAGES = {
  400: "入力内容を確認してください。",
  401: "ログインの有効期限が切れました。もう一度ログインしてください。",
  422: "入力内容に誤りがあります（学習時間は1〜600分、記述は2000字以内）。",
  429: "アクセスが集中しています。少し時間をおいてお試しください。",
};
const SERVER_ERROR_MESSAGE = "AIの採点に失敗しました。時間をおいて再度お試しください。";
const PLAN_ERROR_MESSAGE = "設定を保存できませんでした。時間をおいて再度お試しください。";
const NETWORK_ERROR_MESSAGE = "通信に失敗しました。インターネット接続を確認してください。";

// /plan の 400 は、どの項目が原因かだけをフロントの言葉で伝える
const PLAN_400_MESSAGES = {
  "受験日が不正です": "受験日は今日より後の日付を選んでください。",
  "受験日までの期間が短すぎます": "受験日までの期間が短すぎます。受験日を確認してください。",
};

async function postJson(path, payload, { serverError, messages400 = {} }) {
  const user = auth.currentUser;
  if (!user) throw new Error(STATUS_MESSAGES[401]);

  const token = await user.getIdToken();

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("[API network error]", err);
    throw new Error(NETWORK_ERROR_MESSAGE);
  }

  if (!res.ok) {
    // 詳細は開発者向けのConsoleにだけ出す
    const body = await res.text().catch(() => "");
    console.error(`[API error] ${path} status=${res.status}`, body);
    if (res.status === 400) {
      let detail = "";
      try {
        detail = JSON.parse(body).detail;
      } catch {
        detail = "";
      }
      if (messages400[detail]) throw new Error(messages400[detail]);
    }
    throw new Error(STATUS_MESSAGES[res.status] || serverError);
  }

  return res.json();
}

export function requestAdvice({ subject, minutes, reflection }) {
  return postJson("/advise", { subject, minutes, reflection }, { serverError: SERVER_ERROR_MESSAGE });
}

/** 初期設定（学年・受験日・ペース・志望学部・ニックネーム）を保存し、育成の予定（plan）を作る */
export function requestPlan({ grade, examDate, pace, facultyId, nickname }) {
  return postJson(
    "/plan",
    { grade, examDate, pace, facultyId, nickname },
    { serverError: PLAN_ERROR_MESSAGE, messages400: PLAN_400_MESSAGES }
  );
}
