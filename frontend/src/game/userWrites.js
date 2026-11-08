// ブラウザから users/{uid} に書いてよい項目だけを書く（firestore.rules の timerOnly・outfitOnly と同じ範囲）
// EXP・進化・親密度・連続日数はここでは書かない（バックエンドだけが書く）
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../firebase";

/** 勉強タイマーを始める。timerStartedAt があるあいだは着替えがロックされる */
export function startTimer(uid) {
  return updateDoc(doc(db, "users", uid), { timerStartedAt: serverTimestamp() });
}

/** 勉強タイマーを止める（終了・中止のどちらでも null に戻す） */
export function stopTimer(uid) {
  return updateDoc(doc(db, "users", uid), { timerStartedAt: null });
}

/** 着替えを保存する。outfits は { "1": 装備, "2": 装備, "3": 装備 } */
export function saveOutfit(uid, equipped, outfits) {
  return updateDoc(doc(db, "users", uid), { equipped, outfits });
}

// タイマーの教科・目標・一時停止は端末だけに置く（ルールで書けるのは timerStartedAt だけのため）
const timerKey = (uid) => `timer:${uid}`;

export function loadTimerLocal(uid) {
  try {
    const raw = localStorage.getItem(timerKey(uid));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveTimerLocal(uid, value) {
  try {
    if (value) localStorage.setItem(timerKey(uid), JSON.stringify(value));
    else localStorage.removeItem(timerKey(uid));
  } catch {
    // 保存できない環境（プライベートモードなど）でもタイマーは動かす
  }
}
