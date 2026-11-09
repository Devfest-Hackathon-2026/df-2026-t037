#!/usr/bin/env bash
# 【デモ動画の直前に1回だけ】デモ用アカウントを「録画できる状態」にそろえる。Cloud Shell の backend/ で実行する
#   bash tools/demo_prepare.sh <uid>
# 1. 前に入れたデモ記録を消して、昨日までの14日分を入れ直す（日付が録画の日に合う）
# 2. 1回目の進化の直前（30EXP手前）にする → 録画中に30分以上の記録を1回すると進化する
# 3. Cloud Run を止まらない設定（最小インスタンス1）にして、最初の待ち時間をなくす
# 4. API を1回呼んで起こしておく
set -euo pipefail
UID_ARG="${1:?uid を指定してください（python3 tools/dev_growth.py list で確かめる）}"
cd "$(dirname "$0")/.."

python3 tools/seed_demo.py clear "$UID_ARG"
python3 tools/seed_demo.py seed "$UID_ARG"
python3 tools/dev_growth.py set "$UID_ARG" first

gcloud run services update study-advisor-api --region asia-northeast1 --min-instances 1 --quiet
URL=$(gcloud run services describe study-advisor-api --region asia-northeast1 --format='value(status.url)')
curl -s "$URL/health" && echo
echo "準備できました。録画が終わったら、費用を止めるために次を実行してください："
echo "  gcloud run services update study-advisor-api --region asia-northeast1 --min-instances 0"
