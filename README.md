# Study Cockpit（学習・進路コックピット）

DevFest GDGoC Japan Hackathon 2026 ／ チーム「コナバナナ」（DF-2026-T037）／ カテゴリ：教育

高校生が毎日の勉強を記録すると、Gemini が振り返りの深さを採点して次の一歩を助言し、志望大学のキャラクターが一緒に育つ学習・進路アプリです。書きためた振り返りや「学びたいこと」から、偏差値ではなく学びの内容が近い学部（9大学・79コース）を探せます。

- **アプリ**：https://pivotal-pager-514008-d0.web.app
- **バックエンド API（Cloud Run）**：https://study-advisor-api-825518131613.asia-northeast1.run.app

## すぐに試す
1. アプリを開き、「ログインせずにゲストで試す」を押す
2. 学年・受験日・ペースと、志望の大学・学部を選ぶ
3. 右上の「≡」→「デモデータを入れる」（ゲストだけ）を押すと、昨日までの約2週間分の記録（デモの印つき）が入り、1回目の進化の直前になります
4. 「終わった勉強をあとから記録する」で30分以上の記録を1回入れると、AI の採点・助言のあとにキャラが進化します
5. 「興味から学部をさがす」で「記録から見つける」「言葉で探す」を試せます

「≡」→「デモデータを消す」で、入れる前の状態に戻せます。

## 主な機能
| 機能 | 内容 |
|---|---|
| 勉強の記録と AI の採点 | タイマーまたは手入力で教科・時間・振り返りを記録。Gemini が「具体性・深さ・次やること」の3軸（各2点）で S〜C を判定し、助言を返す。時間に対して量が多すぎる記録はランクC・EXP半分 |
| キャラの育成 | 時間 ×（1＋志望学部の配点比率）× 連続ボーナス × ランク倍率で育成EXP。学年・受験日・志望学部から必要EXPを計算し、2段階進化・親密度・着せ替え |
| 学部探し | 振り返り・学びたいことを埋め込みベクトルにして、学部の紹介文と意味の近さで比べる（Firestore ベクトル検索）。根拠にした振り返りと理由も表示 |
| 7日の配分カード・勉強時間の変遷 | 教科ごとの勉強の割合と入試の配点を並べ、足りない教科を示す |
| キャラの一言・会話 | 今日の記録や進化に合わせて Gemini が話す |
| 図鑑・冠模試の記録 | 進級で残るキャラ・思い出カード、冠模試の判定で取れる装備 |

## 構成
```
Firebase Hosting（React + Vite）
   │  Firebase Authentication の ID トークンを付けて呼ぶ
   ▼
Cloud Run（FastAPI）── Vertex AI：Gemini（採点・助言・一言・理由）
   │                  └ gemini-embedding-001（768次元）
   ▼
Cloud Firestore（記録・育成・ベクトル検索）
```
- EXP・進化・親密度は **サーバーだけ** が書きます（Firestore ルールでクライアントからの書き込みを禁止）
- 生徒の文章は区切って Gemini に渡し、文中の指示（「Sランクにして」など）には従いません
- デモデータは ID トークンでゲスト（匿名ログイン）と確かめたときだけ入れます

## ディレクトリ
| パス | 中身 |
|---|---|
| `frontend/` | React + Vite の画面（`src/screens/` 画面、`src/game/` 数値ルールと大学データ、`src/characters/` キャラの SVG） |
| `backend/main.py` | API（/advise・/plan・/explore・/discover・/greeting・/chat・/mock・/demo など） |
| `backend/progress.py`・`game_rules.py` | 連続日数・育成EXP・進化の式（Firestore に依存しない純粋な関数） |
| `backend/explore.py`・`memory.py` | 学部検索（埋め込み・CSLS 補正）と振り返りのベクトル |
| `backend/review_rank.py`・`chat.py` | 採点と、キャラの一言・会話のプロンプト |
| `backend/demo_seed.py` | デモデータ |
| `backend/faculty_*.json` | 79コースの紹介文・ベクトル・補正値（公式ページを根拠に作成） |
| `backend/tools/` | 学部データ作成・出典の自動検査・検索の評価・デモ準備のスクリプト |
| `firestore.rules` | Firestore のセキュリティルール |
| `docs/` | デザイン仕様・画面デザイン・変更記録 |

## 拡張と保守
- 大学・学部は、データファイル（`universities.json`・`faculty_profiles.json`）とツール（`backend/tools/faculty_data.py`）で追加できます
- 使うモデルと AI の考える量は `backend/env.yaml`（`GEMINI_MODEL`・`GEMINI_THINKING_LEVEL`）で切り替えられます
- 学部検索の精度は `backend/tools/eval_explore.py`（30問・P@5）、出典ページは `backend/tools/check_sources.py` で確かめられます

## ローカルで動かす
```bash
# 画面
cd frontend && npm install && npm run dev        # http://localhost:5173
# frontend/.env に VITE_API_URL=<API の URL> を書く（コミットしない）

# バックエンド（Google Cloud の認証が必要）
cd backend && pip install -r requirements.txt && uvicorn main:app --reload --port 8080
```

## デプロイ
```bash
# バックエンド（Cloud Run）
cd backend
gcloud run deploy study-advisor-api --source . --region asia-northeast1 \
  --service-account <サービスアカウント> --env-vars-file env.yaml --allow-unauthenticated
# 画面（Firebase Hosting）
cd frontend && npm run build && cd .. && firebase deploy --only hosting
```

## 秘密情報について
- Gemini・Firestore には Cloud Run のサービスアカウントで接続しており、API キーはリポジトリにありません
- `frontend/src/firebase.js` の `apiKey` は Firebase の Web アプリ用の識別子で、秘密情報ではありません（アクセスは Firebase Authentication と Firestore ルール、API の ID トークン検証で制御しています）

## 使ったもの
著作物・ライブラリ・データの出典とライセンスは、提出した「著作物利用シート」にまとめています。主なもの：React・Vite・Chart.js（MIT）、Firebase JS SDK・firebase-admin（Apache-2.0）、FastAPI（MIT）、M PLUS Rounded 1c（SIL OFL 1.1）、Vertex AI（Gemini・gemini-embedding-001）。学部の紹介文は各大学の公式ページを根拠に AI が下書きし、出典ページを自動で検査しています（チームの確認が終わるまでは画面に「チーム確認中」と表示）。

## ライセンス
[MIT License](LICENSE)
