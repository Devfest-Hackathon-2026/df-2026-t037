"""進路たまごっち（仮）の数値ルール（Python版）。

frontend/src/game/rules.js と同じ式。EXP・進化・親密度はこのファイルを使ってサーバー（main.py）だけが決める。
片方を変えたら、もう片方も同じように直すこと。
"""
from __future__ import annotations

import json
import math
from datetime import date, timedelta
from pathlib import Path

_DATA = json.loads((Path(__file__).parent / "universities.json").read_text(encoding="utf-8"))
FACULTIES = {f["id"]: f for f in _DATA["faculties"]}
UNIVERSITIES = {u["id"]: u for u in _DATA["universities"]}

# 配点の教科は6つ（C-22）：数学 / 理科 / 英語 / 国語 / 地歴・公民 / 小論文・総合問題
CATEGORIES = ("math", "sci", "eng", "jp", "soc", "essay")

# 前のデータの学部id → 今のid（すでに選んでいる人のため。universities.js の FACULTY_ALIASES と同じ）
FACULTY_ALIASES = {"keio-sfc": "keio-env"}


def resolve_faculty_id(faculty_id: str | None) -> str | None:
    """前のidなら今のidに読みかえる。知らないidは None"""
    fid = FACULTY_ALIASES.get(faculty_id or "", faculty_id)
    return fid if fid in FACULTIES else None

# 学年ごとの1日の目安（時間）。高3は受験学年なので毎日8時間
GRADE_HOURS = {"高1": 2.5, "高2": 3.5, "高3": 8.0}
EXAM_GRADES = {"高3"}
PACE_FACTOR = {"yuttari": 0.8, "futsuu": 1.0, "gattsuri": 1.2}
CONTINUITY = 1.15
MIN_SEASON_DAYS = 60

# 今のアプリの学年表記（"高校2年生" など）との対応
GRADE_FROM_APP = {"高校1年生": "高1", "高校2年生": "高2", "高校3年生": "高3"}


def is_long_vacation(d: date) -> bool:
    m, day = d.month, d.day
    return (m == 7 and day >= 21) or m == 8 or (m == 12 and day >= 25) or (m == 1 and day <= 7) \
        or (m == 3 and day >= 25) or (m == 4 and day <= 7)


def standard_hours(grade: str, d: date) -> float:
    if grade in EXAM_GRADES:
        return GRADE_HOURS[grade]
    return GRADE_HOURS[grade] * (1.5 if is_long_vacation(d) else 1.0)


def _next_grade(g: str) -> str:
    return "高2" if g == "高1" else "高3"


def _fiscal_year_end(d: date) -> date:
    return date(d.year + 1 if d.month >= 4 else d.year, 3, 31)


def make_season(grade: str, start: date, exam_date: date):
    """受験しない学年は3月31日まで、高3は受験日まで。残り60日未満なら次の学年とつなぐ。"""
    if grade in EXAM_GRADES:
        return start, exam_date, (lambda d: grade)
    end = _fiscal_year_end(start)
    joined = False
    if (end - start).days < MIN_SEASON_DAYS:
        joined = True
        ng = _next_grade(grade)
        end = exam_date if ng in EXAM_GRADES else _fiscal_year_end(end + timedelta(days=1))
    boundary = _fiscal_year_end(start) + timedelta(days=1)
    return start, end, (lambda d: _next_grade(grade) if joined and d >= boundary else grade)


def average_multiplier(w: dict) -> float:
    return 1 + sum((v / 100) ** 2 for v in w.values())


def faculty_factor(f: dict) -> float:
    return (1 + 0.05 * (f["subjects"] - 4)) * (1 + 0.15 * f["weights"]["essay"] / 100) * f["uniFactor"]


def make_plan(grade: str, start: date, exam_date: date, faculty_id: str, pace: str = "futsuu") -> dict:
    """シーズンのはじめに1回だけ計算して users/{uid}.plan に保存する。"""
    f = FACULTIES[resolve_faculty_id(faculty_id)]
    s, e, grade_on = make_season(grade, start, exam_date)
    L = (e - s).days
    targets = {"first": min(0.1 * L, 30), "final": 0.45 * L, "bond10": 0.85 * L}

    def sum_hours(days: float) -> float:
        h, i = 0.0, 0
        while i < days:
            d = s + timedelta(days=i)
            h += standard_hours(grade_on(d), d)
            i += 1
        return h

    hours = {k: sum_hours(v) for k, v in targets.items()}
    k = 60 * average_multiplier(f["weights"]) * faculty_factor(f) * CONTINUITY * PACE_FACTOR[pace]
    return {
        "seasonStart": s.isoformat(), "seasonEnd": e.isoformat(),
        "hours": hours,
        "exp": {key: int(round(h * k / 100) * 100) for key, h in hours.items()},
    }


def streak_bonus(streak: int) -> float:
    return 1.2 if streak >= 30 else 1.15 if streak >= 14 else 1.1 if streak >= 7 else 1.05 if streak >= 3 else 1.0


def streak_threshold_minutes(grade: str) -> int:
    return round(GRADE_HOURS[grade] * 60 / 4)


def growth_exp(minutes: int, category: str, faculty_id: str, streak: int) -> int:
    """育成EXP＝分数×（1＋その教科の配点比率）×連続ボーナス。

    配点に無いカテゴリ（情報など、category=None）は配点比率0%として扱う。
    """
    w = FACULTIES[resolve_faculty_id(faculty_id)]["weights"]
    return int(round(minutes * (1 + w.get(category, 0) / 100) * streak_bonus(streak)))


def stage_of(exp: int, plan: dict) -> int:
    return 3 if exp >= plan["exp"]["final"] else 2 if exp >= plan["exp"]["first"] else 1


def bond_of(exp: int, plan: dict) -> int:
    if exp < plan["exp"]["final"]:
        return 0
    step = (plan["exp"]["bond10"] - plan["exp"]["final"]) / 10
    return min(10, math.floor((exp - plan["exp"]["final"]) / step))


if __name__ == "__main__":
    # 動作確認：高3・科学大 工学院（uniFactor 1.01・79コースのデータ）→ 22,700 / 113,000 / 213,100 になればOK
    # （16学部のときの値は 22,500 / 111,900 / 211,000。C-19 で rules.js と同じ結果になるかのテストを足す）
    p = make_plan("高3", date(2027, 4, 1), date(2028, 2, 25), "kagaku-eng")
    print(p["exp"])
    print(growth_exp(20, "sci", "kagaku-eng", 6))  # 29
