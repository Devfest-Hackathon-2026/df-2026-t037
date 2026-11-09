"""デモデータ（ゲストのアカウントだけ）。過去の日付で約2週間分の学習記録を入れ、すぐ機能を見られるようにする。

7日の配分カード・勉強時間のグラフ・連続日数・「記録から見つける」は日付の広がった記録が必要で、
その場では確かめられないため、デモ用に過去の日付で書き込む。

- アプリの「≡ → デモデータを入れる」（main.py の /demo/seed・/demo/clear）と、
  開発用の tools/seed_demo.py の両方から使う
- Gemini は呼ばない（採点・助言はあらかじめ用意した文）
- EXP・連続日数・育成EXP は、アプリと同じ式（progress.py）で1件ずつ計算する
- 入れた記録には demoSeed: true を付け、入れる前の値を users/{uid}.demoBackup に残す（clear で元に戻せる）
"""
from __future__ import annotations

import random
from datetime import datetime, time, timedelta

from firebase_admin import firestore

import progress
from review_rank import rank_of

RANK_EXP = {"S": 50, "A": 30, "B": 15, "C": 5}  # main.py と同じ
BACKUP_FIELDS = ("totalExp", "growthExp", "stage", "bond", "streak", "lastStudyDate",
                 "todayMinutes", "lastStreakDate", "restTicketWeek")
DAYS = 14
MARGIN = 30  # 1回目の進化の何EXP手前にするか（30分の記録1回で超えられる量）

# 教科ごとの記録の文と助言（採点の3軸：具体さ・深さ・次の一手）
SAMPLES = {
    "英語": [
        ("長文読解を2題。設問の根拠になる文に線を引きながら読んだ。1問、指示語の取り違えで落とした。明日は指示語に印をつけて同じ形式を1題やる", (2, 2, 2),
         "根拠に線を引く読み方ができています。指示語の取り違えは、指す内容を余白にメモすると防げます。"),
        ("単語帳のLesson 12〜14を100語。覚えていなかった18語に付箋を貼った", (2, 1, 1),
         "付箋の18語は、明日の朝にもう一度だけ見直すと定着しやすくなります。"),
        ("英作文を1題。三単現のsを2か所落とした。書いたあとに動詞だけ見直す手順を決めた", (2, 2, 2),
         "見直しの手順を決めたのが良い一手です。次は時制にも同じ確認を足してみましょう。"),
        ("英語の長文で、海洋プラスチックが生き物に与える影響の文章を読んだ。内容が面白くて、要約を3行で書いた。知らない単語が12個あった", (2, 2, 1),
         "興味を持てた題材は記憶に残りやすいです。12個の単語は明日の朝に見直しましょう。"),
        ("リスニングを20分。数字の聞き取りで3問落とした。スクリプトで聞き取れなかった所を確認し、明日もう一度聞く", (2, 2, 2),
         "聞き取れなかった所をスクリプトで確かめる手順がとても良いです。"),
    ],
    "数学": [
        ("ベクトルの内積を問題集で10問。2問まちがえ、どちらも成分の計算ミスだった。明日は同じ型を5問やり直す", (2, 2, 2),
         "まちがいの原因を計算ミスと特定できています。数学は配点に対して時間が少なめなので、今週は少し増やしましょう。"),
        ("数列の漸化式。特性方程式の形は解けたが、n乗が入る形で止まった", (2, 1, 0),
         "止まった形が分かっているので、次は解説の最初の一行だけ見て再挑戦してみましょう。"),
        ("確率の条件付き確率を8問。ロボットが迷路で道を選ぶ例題がおもしろかった。樹形図をかくと整理できると分かった。明日は残りの4問", (2, 2, 2),
         "樹形図で整理する方法を自分で見つけられています。"),
        ("微分で関数の増減表を書く練習を6問。極値の符号で1問まちがえた。明日は増減表の矢印を先に書いてから値を入れる", (2, 2, 2),
         "手順を変える具体的な対策が立てられています。"),
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
        ("電気回路のキルヒホッフの法則を5問。電流の向きを仮定する理由が分かった。モーターやロボットの回路にもつながると思った", (2, 2, 1),
         "身近な機械とつなげて考えられているのが良いです。次は回路を自分で描いて解いてみましょう。"),
        ("波の干渉の問題を4問。経路差と波長の関係を図で整理した。1問、半波長のずれを忘れた。明日は同じ型を2問やる", (2, 2, 2),
         "まちがいの原因がはっきりしています。"),
    ],
    "化学": [
        ("化学平衡と平衡定数の計算を8問。単位の書き忘れが2問あった。明日は単位を先に書いてから計算する", (2, 2, 2),
         "単位を先に書くという具体的な対策が立てられています。"),
        ("有機化学の構造決定を3問。異性体を書き出すのに時間がかかった。炭素の骨格から順に書く方法を試す", (2, 1, 2),
         "書き出す順番を決めるのは良い方法です。"),
        ("酸と塩基の中和滴定を5問。指示薬の選び方の理由を説明できるようになった。環境の水質検査にも使われると知った", (2, 2, 1),
         "理由まで説明できるのは深い理解です。次は計算問題も足しましょう。"),
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


def seed(db, uid: str, user: dict, near_first: bool = False) -> dict:
    """デモの記録を入れる。near_first=True なら、そのあと1回目の進化の MARGIN 手前まで育成EXPを進める。
    入れた記録の (log_id, reflection, log) の一覧も返す（ベクトルを作るため）"""
    ref = db.collection("users").document(uid)
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
    written = []

    today = progress.today_jst()
    for ago in range(DAYS, 0, -1):  # 今日は空けておく（その場で記録して見せるため）
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
            log_ref = ref.collection("study_logs").document()
            log = {
                "subject": subject, "minutes": minutes, "reflection": text,
                "base_exp": base, "verbal_score": rank, "rank": rank, "multiplier": mult,
                "total": total, "scores": scores, "hint": "", "penalty": None, "rankPending": False,
                "bonus_exp": bonus, "advice": advice, "model": "demo-seed",
                "seasonId": season, "category": progress.SUBJECT_CATEGORY.get(subject),
                "growth_exp": gained, "streak": streak_fields["streak"],
                "createdAt": at, "demoSeed": True,
            }
            batch.set(log_ref, log)
            written.append((log_ref.id, log))

    # デモを入れる前に、今日すでに記録していたら、その分を今日の勉強時間として数え直す（連続日数がずれないように）
    today_s = today.isoformat()
    if user.get("lastStudyDate") == today_s and int(user.get("todayMinutes") or 0) > 0:
        state.update(progress.update_streak(state, today, int(user["todayMinutes"]), grade))

    if near_first:
        growth = max(growth, int(plan["exp"]["first"]) - MARGIN)
    stage, bond = progress.stage_and_bond(growth, plan)
    updates = {k: state[k] for k in ("streak", "lastStudyDate", "todayMinutes", "lastStreakDate", "restTicketWeek")}
    updates.update({"growthExp": growth, "stage": stage, "bond": bond,
                    "totalExp": firestore.Increment(total_gain), "demoBackup": backup})
    batch.set(ref, updates, merge=True)
    batch.commit()
    return {"count": len(written), "streak": updates["streak"], "growthExp": growth,
            "stage": stage, "bond": bond, "logs": written}


def clear(db, uid: str, user: dict) -> int:
    """デモの記録とそのベクトルを消し、入れる前の EXP・連続日数に戻す。消した件数を返す"""
    ref = db.collection("users").document(uid)
    logs = list(ref.collection("study_logs").where(filter=firestore.FieldFilter("demoSeed", "==", True)).stream())
    batch = db.batch()
    n = 0
    for s in logs:
        batch.delete(s.reference)
        batch.delete(ref.collection("log_vectors").document(s.id))
        n += 2
        if n >= 450:  # 1回のまとめ書きは500件まで
            batch.commit()
            batch = db.batch()
            n = 0
    backup = user.get("demoBackup")
    if isinstance(backup, dict):
        batch.set(ref, {**{k: backup.get(k) for k in BACKUP_FIELDS}, "demoBackup": firestore.DELETE_FIELD}, merge=True)
    batch.commit()
    return len(logs)
