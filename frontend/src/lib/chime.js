// タイマーの終わりの音（C-6）。外部の音声ファイルは使わず、Web Audio で「ポン・ポン・ポーン」と鳴らす
// 画面を閉じている・ロック中は鳴らない（ブラウザの制限）。そのときは次に開いたときに「時間になりました」を出す
let ctx;

/** タイマー開始ボタンを押したときに呼ぶ（スマホは操作の中で一度鳴らす準備が必要） */
export function unlockChime() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    // 音が使えない環境でもタイマーは動かす
  }
}

/** タイマー終了時に呼ぶ */
export function playChime() {
  if (!ctx) return;
  try {
    const notes = [[880, 0], [880, 0.35], [1175, 0.7]];
    for (const [freq, t] of notes) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + (t === 0.7 ? 0.9 : 0.3));
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 1);
    }
    navigator.vibrate?.([200, 120, 200]);
  } catch {
    // 鳴らせなくても画面の表示は続ける
  }
}

// ≡ メニューの「終わりの音 オン／オフ」。初期値はオン
const KEY = 'chime:on';

export function isChimeOn() {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setChimeOn(on) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // 保存できない環境では、今の画面のあいだだけ切りかえる
  }
}
