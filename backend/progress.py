"""キャラクター育成の進み具合（連続日数・育成EXP・進化段階・親密度）を決める。

Firestore に依存しない純粋な関数だけを置く。main.py がトランザクションの中で呼ぶ。
数値の式そのものは game_rules.py にあり、ここでは組み合わせ方だけを決める。
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import math

from game_rules import (
    GRADE_FROM_APP,
    bond_of,
    growth_exp,
    growth_exp_raw,
    make_plan,
    resolve_faculty_id,
    round_half_up,
    stage_of,
    streak_threshold_minutes,
)

# Cloud Run の時計は UTC なので、日付は必ず日本時間で数える
JST = timezone(timedelta(hours=9))

# 言語化ランク倍率（それ以外・ランクなしは 1.0）
RANK_MULTIPLIER = {"S": 1.3, "A": 1.2, "B": 1.1, "C": 1.0}

# 記録できる教科と、配点のカテゴリ。None は配点が無い教科（倍率 1.0）
#（frontend/src/game/subjects.js の SUBJECT_CATEGORY と同じ。6教科：C-22。実技はなくした）
SUBJECT_CATEGORY = {
    "数学": "math",
    "物理": "sci", "化学": "sci", "生物": "sci", "地学": "sci",
    "英語": "eng",
    "国語": "jp", "現代文": "jp", "古典": "jp", "古文": "jp", "漢文": "jp",
    "日本史": "soc", "世界史": "soc", "地理": "soc",
    "公民": "soc", "倫理": "soc", "政経": "soc",
    "小論文・総合問題": "essay", "小論文": "essay", "総合問題": "essay", "記述": "essay",
    "情報": None,
    # 前のアプリの教科名（まとめた呼び方）もそのまま受け付ける
    "理科": "sci",
    "地歴・公民": "soc",
}

# 記録の上限（C-23）：画面とサーバーの時計のずれを少しだけ見こむ
TIMER_CLOCK_SKEW_SEC = 30


def today_jst() -> date:
    return datetime.now(JST).date()


def week_id(d: date) -> str:
    """おやすみ券の「週」。ISO週（月曜はじまり）"""
    y, w, _ = d.isocalendar()
    return f"{y}-W{w:02d}"


def game_grade(app_grade: str | None) -> str | None:
    """"高校2年生" → "高2"。未設定なら None"""
    return GRADE_FROM_APP.get(app_grade or "")


def _parse_date(value) -> date | None:
    if not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def update_streak(user: dict, today: date, minutes: int, grade: str) -> dict:
    """1件の記録を足したあとの連続日数まわりの値を返す（users/{uid} にそのまま保存する）。

    - その日の合計が学年の目安の1/4をこえた最初の記録で streak を＋1（1日1回だけ）
    - 前回の「続けた日」から1日だけ空いていて、その週のおやすみ券が未使用なら券を使って連続を保つ
    - それ以外で空いていたら streak を半分にしてから＋1
    """
    today_s = today.isoformat()
    prev_minutes = int(user.get("todayMinutes") or 0) if user.get("lastStudyDate") == today_s else 0
    total = prev_minutes + minutes

    streak = int(user.get("streak") or 0)
    last_streak = _parse_date(user.get("lastStreakDate"))
    ticket_week = user.get("restTicketWeek")

    crossed = total >= streak_threshold_minutes(grade) and last_streak != today
    if crossed:
        gap = (today - last_streak).days if last_streak else None
        if gap is not None and gap >= 2:
            missed_week = week_id(today - timedelta(days=1))
            if gap == 2 and ticket_week != missed_week:
                ticket_week = missed_week  # おやすみ券を使って連続を保つ
            else:
                streak //= 2
        streak += 1
        last_streak = today

    return {
        "lastStudyDate": today_s,
        "todayMinutes": total,
        "streak": streak,
        "lastStreakDate": last_streak.isoformat() if last_streak else None,
        "restTicketWeek": ticket_week,
    }


def growth_for_log(minutes: int, subject: str, faculty_id: str, streak: int, rank: str | None) -> int:
    """育成EXP＝分数×（1＋志望学部の配点比率）×連続ボーナス×言語化ランク倍率"""
    raw = growth_exp_raw(minutes, SUBJECT_CATEGORY.get(subject), faculty_id, streak)
    return round_half_up(raw * RANK_MULTIPLIER.get(rank or "", 1.0))


def has_plan(user: dict) -> bool:
    plan = user.get("plan")
    return (
        isinstance(plan, dict)
        and isinstance(plan.get("exp"), dict)
        and resolve_faculty_id(user.get("targetFacultyId")) is not None
    )


def stage_and_bond(exp: int, plan: dict) -> tuple[int, int]:
    return stage_of(exp, plan), bond_of(exp, plan)


def rescale_growth(exp: int, old_plan: dict | None, new_plan: dict) -> int:
    """志望校やペースを変えたとき、進み具合（%）を保つように育成EXPを置きかえる"""
    try:
        old_bond10 = old_plan["exp"]["bond10"]
    except (TypeError, KeyError):
        return exp
    if exp <= 0 or old_bond10 <= 0:
        return exp
    return int(round(exp * new_plan["exp"]["bond10"] / old_bond10))


def plan_is_usable(plan: dict) -> bool:
    """親密度の1段の幅が0以下になるほど短いシーズンは扱えない（bond_of が0で割ってしまう）"""
    e = plan["exp"]
    return e["first"] > 0 and e["final"] > e["first"] and e["bond10"] > e["final"]


def timer_minutes_limit(started_at: datetime, now: datetime) -> int:
    """タイマーで記録できる分数の上限（C-23）。画面と同じ式：経過秒を切り上げ、最低1分。

    一時停止した時間もふくむので、画面で測った分数より小さくなることはない
    """
    elapsed = (now - started_at).total_seconds() + TIMER_CLOCK_SKEW_SEC
    return max(1, math.ceil(elapsed / 60))


def season_reset_fields(user: dict) -> dict:
    """学年を変えたときに、育成をはじめからにする項目（C-25）。記録（logs）は消さずに seasonId だけ変える"""
    return {
        "growthExp": 0,
        "stage": 1,
        "bond": 0,
        "streak": 0,
        "todayMinutes": 0,
        "lastStreakDate": None,
        "restTicketWeek": None,
        # 親密度で解放したアイテムは bond から決まるので、つけていた装備とコーデも外す
        "equipped": {},
        "outfits": {},
        "seasonId": int(user.get("seasonId") or 0) + 1,
    }


def grade_changed(user: dict, new_grade: str) -> bool:
    """初期設定がすんでいる人が、学年を変えたか"""
    old = user.get("grade")
    return bool(user.get("plan")) and bool(old) and old != new_grade


# ===== C-9 4月1日の自動進級 =====
# 定期実行は作らず、4月1日以降の最初の記録・起動（POST /season/check）のときにまとめて処理する

NEXT_APP_GRADE = {"高校1年生": "高校2年生", "高校2年生": "高校3年生"}
APP_GRADE_NUM = {"高校1年生": 1, "高校2年生": 2, "高校3年生": 3}


def fiscal_year(d: date) -> int:
    """年度（4月はじまり）。2027-03-31 → 2026、2027-04-01 → 2027"""
    return d.year if d.month >= 4 else d.year - 1


def default_exam_date(app_grade: str, fy: int) -> date:
    """受験日の初期値（初期設定と同じ考え方）：高3はその年度の2月25日、高2は1年後、高1は2年後"""
    return date(fy + 1 + (3 - APP_GRADE_NUM[app_grade]), 2, 25)


def _is_joined(start: date, end: date) -> bool:
    """残り60日未満で始めて、次の学年とつないだシーズンか（make_season と同じ考え方）"""
    return end > date(fiscal_year(start) + 1, 3, 31)


def season_rollover(user: dict, today: date) -> dict | None:
    """シーズンの切りかえが必要なら、その内容を返す（必要なければ None）。

    返す形：{"kind": "label" | "promoted" | "ended", "updates": {...}, "dex": {...} | None, "dexId": "2026" | None}
    - label   ：つないだシーズンの途中で4月1日をこえた。学年の表示だけ1つ上げる（育成はそのまま）
    - promoted：シーズンが終わった。今のキャラを図鑑に残し、学年を上げて新しい予定・育成EXP 0から（新しいたまご）
    - ended   ：高3のシーズン（受験日まで）が終わった。図鑑に残して、育成を止める
    """
    if not has_plan(user) or user.get("seasonEnded"):
        return None
    plan = user["plan"]
    start, end = _parse_date(plan.get("seasonStart")), _parse_date(plan.get("seasonEnd"))
    grade = user.get("grade")
    if not start or not end or grade not in APP_GRADE_NUM:
        return None
    start_grade = user.get("seasonStartGrade") or grade
    joined = _is_joined(start, end)

    if today <= end:
        if joined and fiscal_year(today) > fiscal_year(start) and grade == start_grade and grade in NEXT_APP_GRADE:
            return {"kind": "label", "updates": {"grade": NEXT_APP_GRADE[grade]}, "dex": None, "dexId": None}
        return None

    # シーズンが終わった時点の学年（つないだシーズンで表示を上げそびれていたら、ここで上げる）
    end_grade = grade
    if joined and grade == start_grade and grade in NEXT_APP_GRADE:
        end_grade = NEXT_APP_GRADE[grade]

    dex_id = str(fiscal_year(start))
    dex = {
        "fiscalYear": fiscal_year(start),
        "grade": end_grade,
        "facultyId": resolve_faculty_id(user.get("targetFacultyId")),
        "pace": user.get("pace"),
        "growthExp": int(user.get("growthExp") or 0),
        "stage": int(user.get("stage") or 1),
        "bond": int(user.get("bond") or 0),
        "seasonStart": plan.get("seasonStart"),
        "seasonEnd": plan.get("seasonEnd"),
        "seasonId": int(user.get("seasonId") or 0),
        "equipped": user.get("equipped") or {},
    }

    # 高3は受験日でシーズン終了（C-9）。4月をこえて卒業したときも同じ
    new_grade = end_grade
    for _ in range(max(1, fiscal_year(today) - fiscal_year(end))):
        if new_grade not in NEXT_APP_GRADE:
            new_grade = None
            break
        new_grade = NEXT_APP_GRADE[new_grade]
    if end_grade == "高校3年生" or new_grade is None:
        return {"kind": "ended", "updates": {"grade": end_grade, "seasonEnded": True}, "dex": dex, "dexId": dex_id}

    fy = fiscal_year(today)
    new_start = date(fy, 4, 1)
    exam = _parse_date(user.get("examDate"))
    if not exam or exam <= new_start:
        exam = default_exam_date(new_grade, fy)
    new_plan = make_plan(GRADE_FROM_APP[new_grade], new_start, exam, user["targetFacultyId"], user.get("pace") or "futsuu")
    if not plan_is_usable(new_plan):
        return None

    reset = season_reset_fields(user)
    # 連続日数は学年をまたいでも続ける（勉強の習慣は切らない）
    for key in ("streak", "todayMinutes", "lastStreakDate", "restTicketWeek"):
        reset.pop(key, None)
    updates = {
        **reset,
        "grade": new_grade,
        "seasonStartGrade": new_grade,
        "seasonEnded": False,
        "examDate": exam.isoformat(),
        "plan": new_plan,
    }
    return {"kind": "promoted", "updates": updates, "dex": dex, "dexId": dex_id}


# ===== C-15 採点に失敗したときの「判定はあとで」 =====
# 採点（review_rank.judge）に失敗したら、仮に×1.0（Cランクのボーナス）で記録だけ保存し、rankPending を付ける。
# あとで判定が出たら、その差分だけ totalExp と育成EXPを足す

def judgement_updates(log: dict, user: dict, rank: str, rank_exp: dict) -> dict:
    """保存ずみの記録に、あとから出たランクを当てはめたときの差分を返す。

    返す形：{"bonus_exp": 新しいボーナス, "bonusDiff": totalExp に足す数,
             "growth_exp": 新しい育成EXP（記録に書く）, "growthDiff": 育成EXPの差,
             "userUpdates": users/{uid} に書く growthExp・stage・bond（足さないときは空）}
    - 育成EXPは、記録したときの分数・教科・連続日数・志望学部で計算し直す
    - 学年を変えたあと（seasonId がちがう）・シーズンが終わったあとは、育成EXPは足さない（totalExp は足す）
    """
    bonus_new = rank_exp.get(rank, rank_exp["C"])
    out = {
        "bonus_exp": bonus_new,
        "bonusDiff": bonus_new - int(log.get("bonus_exp") or 0),
        "growth_exp": log.get("growth_exp"),
        "growthDiff": 0,
        "userUpdates": {},
    }
    if log.get("growth_exp") is None:
        return out
    faculty_id = log.get("facultyId") or user.get("targetFacultyId")
    if resolve_faculty_id(faculty_id) is None:
        return out
    new_gain = growth_for_log(int(log.get("minutes") or 0), log.get("subject"), faculty_id, int(log.get("streak") or 0), rank)
    diff = new_gain - int(log.get("growth_exp") or 0)
    out["growth_exp"] = new_gain
    out["growthDiff"] = diff
    same_season = int(log.get("seasonId") or 0) == int(user.get("seasonId") or 0)
    if diff and same_season and has_plan(user) and not user.get("seasonEnded"):
        new_exp = max(0, int(user.get("growthExp") or 0) + diff)
        stage, bond = stage_and_bond(new_exp, user["plan"])
        out["userUpdates"] = {"growthExp": new_exp, "stage": stage, "bond": bond}
    return out
