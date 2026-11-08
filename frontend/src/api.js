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
const REQUEST_TIMEOUT_MS = 45000;
const TIMEOUT_MESSAGE = "時間がかかりすぎたので、いったん止めました。少し待ってからもう一度お試しください。";
const NETWORK_ERROR_MESSAGE = "通信に失敗しました。インターネット接続を確認してください。";

// /plan の 400 は、どの項目が原因かだけをフロントの言葉で伝える
const PLAN_400_MESSAGES = {
  "受験日が不正です": "受験日は今日より後の日付を選んでください。",
  "受験日までの期間が短すぎます": "受験日までの期間が短すぎます。受験日を確認してください。",
};

async function postJson(path, payload, { serverError, messages400 = {}, statusMessages = {} }) {
  const user = auth.currentUser;
  if (!user) throw new Error(STATUS_MESSAGES[401]);

  const token = await user.getIdToken();

  // 返事が来ないまま「保存中…」「考え中」が終わらないのを防ぐ（AIの採点や起動直後の待ちを見込んで45秒）
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    console.error("[API network error]", err);
    throw new Error(err?.name === "AbortError" ? TIMEOUT_MESSAGE : NETWORK_ERROR_MESSAGE);
  } finally {
    clearTimeout(timer);
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
    throw new Error(statusMessages[res.status] || STATUS_MESSAGES[res.status] || serverError);
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

const CHAT_ERROR_MESSAGE = "うまく聞きとれなかったみたい。少し待ってからもう一度話しかけてね。";
const CHAT_STATUS_MESSAGES = {
  422: "メッセージは300字までにしてね。",
  429: "今日はたくさん話したね！また明日お話ししよう。",
};

/** キャラとの会話。history は画面が持っている直前の会話（サーバーには保存しない） */
export function requestChat({ message, history }) {
  return postJson("/chat", { message, history }, { serverError: CHAT_ERROR_MESSAGE, statusMessages: CHAT_STATUS_MESSAGES });
}

/** ホームを開いたときの一言（同じ状況ならサーバーが保存した一言を返す） */
export function requestGreeting() {
  return postJson("/greeting", {}, { serverError: CHAT_ERROR_MESSAGE });
}

const EXPLORE_ERROR_MESSAGE = "うまく探せませんでした。少し待ってからもう一度お試しください。";
const EXPLORE_STATUS_MESSAGES = {
  422: "4〜200字で書いてね。",
  429: "今日はたくさん探したね！また明日試してみよう。",
  503: "学部の紹介文を準備中です。もう少し待ってね。",
};

/** 興味から学部を逆引き（意味の近さ：Vertex AI の埋め込み／理由：Gemini） */
export function requestExplore({ interest }) {
  return postJson("/explore", { interest }, { serverError: EXPLORE_ERROR_MESSAGE, statusMessages: EXPLORE_STATUS_MESSAGES });
}

