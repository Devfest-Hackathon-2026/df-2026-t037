"""【デモ動画用】ゲストのテスト用アカウントに、過去の日付で約2週間分の学習記録を入れるスクリプト。

7日の配分カード・勉強時間のグラフ・連続日数・「記録から見つける」は日付の広がった記録が必要で、
手で入力すると全部が今日の日付になるため、デモ用に過去の日付で書き込む。

安全のため:
- ゲスト（匿名ログイン）のアカウントにしか使えない（Googleログインの本物の利用者は書き換えない）
- 初期設定（志望・学年）が終わったアカウントだけ
- 入れた記録には demoSeed: true を付ける（clear で消せる）
- Gemini は呼ばない（採点・助言はあらかじめ用意した文。費用はかからない）
- EXP・連続日数・育成EXP は、アプリと同じ式（progress.py）で1件ずつ計算する

Cloud Shell で backend/ から実行する:
    python3 tools/dev_growth.py list              # ゲストの uid を確かめる
    python3 tools/seed_demo.py seed <uid>         # 14日分を入れる（日数を変えるなら seed <uid> 10）
    python3 tools/seed_demo.py clear <uid>        # 入れたデモ記録を消して、連続日数・EXPを元に戻す
"""
from __future__ import annotations

import os
import random
import sys
from datetime import datetime, time, timedelta
from pathlib import Path

import firebase_admin
from firebase_admin import auth, firestore

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import progress  # noqa: E402
from review_rank import rank_of  # noqa: E402

PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "pivotal-pager-514008-d0")
RANK_EXP = {"S": 50, "A": 30, "B": 15, "C": 5}  # main.py と同じ
BACKUP_FIELDS = ("totalExp", "growthExp", "stage", "bond", "streak", "lastStudyDate",
                 "todayMinutes", "lastStreakDate", "restTicketWeek")

if not firebase_admin._apps:
    firebase_admin.initialize_app(options={"projectId": PROJECT_ID})
db = firestore.client()

# 教科ごとの記録の文と助言（採点の3軸：具体さ・深さ・次の一手）
SAMPLES = {
    "英語": [
        ("長文読解を2題。設問の根拠になる文に線を引きながら読んだ。1問、指示語の取り違えで落とした。明日は指示語に印をつけて同じ形式を1題やる", (2, 2, 2),
         "根拠に線を引く読み方ができています。指示語の取り違えは、指す内容を余白にメモすると防げます。"),
        ("単語帳のLesson 12〜14を100語。覚えていなかった18語に付箋を貼った", (2, 1, 1),
         "付箋の18語は、明日の朝にもう一度だけ見直すと定着しやすくなります。"),
        ("英作文を1題。三単現のsを2か所落とした。書いたあとに動詞だけ見直す手順を決めた", (2, 2, 2),
         "見直しの手順を決めたのが良い一手です。次は時制にも同じ確認を足してみましょう。"),
    ],
    "数学": [
        ("ベクトルの内積を問題集で10問。2問まちがえ、どちらも成分の計算ミスだった。明日は同じ型を5問やり直す", (2, 2, 2),
         "まちがいの原因を計算ミスと特定できています。数学は配点に対して時間が少なめなので、今週は少し増やしましょう。"),
        ("数列の漸化式。特性方程式の形は解けたが、n乗が入る形で止まった", (2, 1, 0),
         "止まった形が分かっているので、次は解説の最初の一行だけ見て再挑戦してみましょう。"),
    ],
    "国語": [
        ("古文の助動詞「む」「べし」の意味の判別を20問。推量と意志の区別で3問まちがえた", (2, 2, 1),
         "意味の判別は主語の人称がカギです。まちがえた3問の主語を確かめてみましょう。"),
        ("現代文の評論を1題。筆者の主張を40字でまとめる練習をした", (1, 1, 1),
         "要約の練習は続けると力になります。次は対比になっている語を先に拾ってみましょう。"),
    ],
    "物理": [
        ("力学の運動方程式。斜面上の物体の問題を6問。力の分解の向きを図に書いてから式を立てた", (2, 2, 1),
         "図を書いてから式を立てる手順が身についています。次は摩擦がある場合に進みましょう。"),
    ],
    "化学": [
        ("化学平衡と平衡定数の計算を8問。単位の書き忘れが2問あった。明日は単位を先に書いてから計算する", (2, 2, 2),
         "単位を先に書くという具体的な対策が立てられています。"),
    ],
}

# 1日の予定（日数ぶん繰り返す）。英語に偏らせて、配点とのずれが7日カードで見えるようにする
DAY_PATTERNS = [
    [("英語", 60), ("数学", 40)],
    [("英語", 50), ("国語", 40), ("物理", 30)],
    [("英語", 70), ("化学", 40)],
    [("数学", 50), ("英語", 40)],
    [("英語", 60), ("国語", 30), ("化学", 30)],
    [("物理", 50), ("英語", 50)],
    [("英語", 80), ("数学", 30)],
]
SKIP_DAYS_AGO = {6}  # 1日だけ休んだ日をつくる（おやすみ券で連続日数が保たれる）


def is_guest(uid: str) -> bool:
    return not auth.get_user(uid).provider_data


def load_user(uid: str) -> tuple:
    if not is_guest(uid):
        sys.exit("ゲストのアカウントではないので書き換えません（本物の利用者のデータを守るため）")
    ref = db.collection("users").document(uid)
    user = ref.get().to_dict() or {}
    if not progress.has_plan(user) or not progress.game_grade(user.get("grade")):
        sys.exit("初期設定（志望・学年）がまだのアカウントです。先にアプリで初期設定をしてください")
    return ref, user


def cmd_seed(uid: str, days: int) -> None:
    ref, user = load_user(uid)
    if user.get("demoBackup"):
        sys.exit("すでにデモ記録が入っています。入れ直すなら先に clear してください")
    grade = progress.game_grade(user["grade"])
    plan = user["plan"]
    fid = user["targetFacultyId"]
    season = int(user.get("seasonId") or 0)
    rng = random.Random(7)

    backup = {k: user.get(k) for k in BACKUP_FIELDS}
    # 連続日数は、デモ記録の最初の日から数え直す
    state = {**user, "streak": 0, "lastStudyDate": None, "todayMinutes": 0,
             "lastStreakDate": None, "restTicketWeek": None}
    growth = int(user.get("growthExp") or 0)
    total_gain = 0
    used = {s: 0 for s in SAMPLES}
    batch = db.batch()
    count = 0

    today = progress.today_jst()
    for ago in range(days, 0, -1):  # 今日は空けておく（録画中にその場で記録するため）
        if ago in SKIP_DAYS_AGO:
            continue
        day = today - timedelta(days=ago)
        for i, (subject, minutes) in enumerate(DAY_PATTERNS[ago % len(DAY_PATTERNS)]):
            minutes += rng.choice((-10, 0, 0, 10))
            text, axes, advice = SAMPLES[subject][used[subject] % len(SAMPLES[subject])]
            used[subject] += 1
            total = sum(axes)
            rank, mult = rank_of(total)
            scores = {k: {"score": v, "quote": ""} for k, v in zip(("specific", "depth", "next"), axes)}

            streak_fields = progress.update_streak(state, day, minutes, grade)
            state.update(streak_fields)
            gained = progress.growth_for_log(minutes, subject, fid, streak_fields["streak"], rank)
            growth += gained
            base = min(minutes // 10, 30)
            bonus = RANK_EXP[rank]
            total_gain += base + bonus

            at = datetime.combine(day, time(17 + i * 2, rng.choice((0, 15, 30))), tzinfo=progress.JST)
            batch.set(ref.collection("study_logs").document(), {
                "subject": subject, "minutes": minutes, "reflection": text,
                "base_exp": base, "verbal_score": rank, "rank": rank, "multiplier": mult,
                "total": total, "scores": scores, "hint": "", "penalty": None, "rankPending": False,
                "bonus_exp": bonus, "advice": advice, "model": "demo-seed",
                "seasonId": season, "category": progress.SUBJECT_CATEGORY.get(subject),
                "growth_exp": gained, "streak": streak_fields["streak"],
                "createdAt": at, "demoSeed": True,
            })
            count += 1

    stage, bond = progress.stage_and_bond(growth, plan)
    updates = {k: state[k] for k in ("streak", "lastStudyDate", "todayMinutes", "lastStreakDate", "restTicketWeek")}
    updates.update({"growthExp": growth, "stage": stage, "bond": bond,
                    "totalExp": firestore.Increment(total_gain), "demoBackup": backup})
    batch.set(ref, updates, merge=True)
    batch.commit()
    print(f"{count}件の記録を入れました（{days}日前〜昨日）。連続日数={updates['streak']} "
          f"育成EXP={growth} 段階={stage} 親密度={bond}")
    print("次に、進化の直前にするなら: python3 tools/dev_growth.py set", uid, "first")


def cmd_clear(uid: str) -> None:
    ref, user = load_user(uid)
    logs = list(ref.collection("study_logs").where(filter=firestore.FieldFilter("demoSeed", "==", True)).stream())
    batch = db.batch()
    for s in logs:
        batch.delete(s.reference)
        batch.delete(ref.collection("log_vectors").document(s.id))
    backup = user.get("demoBackup")
    if backup:
        batch.set(ref, {**{k: backup.get(k) for k in BACKUP_FIELDS}, "demoBackup": firestore.DELETE_FIELD}, merge=True)
    batch.commit()
    print(f"デモ記録 {len(logs)} 件を消しました" + ("。EXP・連続日数を入れる前に戻しました" if backup else ""))


if __name__ == "__main__":
    args = sys.argv[1:]
    if len(args) in (2, 3) and args[0] == "seed":
        cmd_seed(args[1], int(args[2]) if len(args) == 3 else 14)
    elif len(args) == 2 and args[0] == "clear":
        cmd_clear(args[1])
    else:
        print(__doc__)
        sys.exit(1)
