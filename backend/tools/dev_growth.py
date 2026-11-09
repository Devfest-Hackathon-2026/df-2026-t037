# File: backend/tools/dev_growth.py
"""【開発・デモ準備用】ゲストのテスト用アカウントの育成EXPを、進化の直前まで進めるスクリプト。

進化は高2で約50時間、高3で約90時間の記録が必要で、その場では確かめられないため、
テスト用アカウントの育成EXPだけを書き換えて、次の1回の記録で進化が起きる状態にする。

安全のため:
- ゲスト（匿名ログイン）のアカウントにしか使えない（Googleログインの本物の利用者は書き換えない）
- 書き換えるのは growthExp・stage・bond だけ（記録・連続日数・計画は変えない）

Cloud Shell で backend/ から実行する:
    pip3 install --user firebase-admin            # 初回だけ
    python3 tools/dev_growth.py list              # 最近のゲストを一覧（uid・志望・育成EXP）
    python3 tools/dev_growth.py set <uid> first   # 1回目の進化の 30 EXP 手前にする
    python3 tools/dev_growth.py set <uid> final   # 最終進化の手前
    python3 tools/dev_growth.py set <uid> bond5   # 親密度5の手前（bond1〜bond10 を指定できる）
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import firebase_admin
from firebase_admin import auth, firestore

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import progress  # noqa: E402

PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "pivotal-pager-514008-d0")
MARGIN = 30  # 目標の何EXP手前にするか（30分の記録1回で超えられる量）

if not firebase_admin._apps:
    firebase_admin.initialize_app(options={"projectId": PROJECT_ID})
db = firestore.client()


def is_guest(uid: str) -> bool:
    u = auth.get_user(uid)
    return not u.provider_data  # 匿名ログインは、つながっているログイン方法が1つもない


def target_exp(plan: dict, goal: str) -> int:
    e = plan["exp"]
    if goal == "first":
        return int(e["first"])
    if goal == "final":
        return int(e["final"])
    if goal.startswith("bond"):
        n = int(goal[4:])
        if not 1 <= n <= 10:
            raise ValueError("bond は 1〜10")
        step = (e["bond10"] - e["final"]) / 10
        return int(e["final"] + step * n)
    raise ValueError("first / final / bond1〜bond10 のどれかを指定してください")


def cmd_list() -> None:
    guests = []
    for u in auth.list_users().iterate_all():
        if not u.provider_data:
            guests.append(u)
    guests.sort(key=lambda u: u.user_metadata.creation_timestamp or 0, reverse=True)
    for u in guests[:10]:
        d = db.collection("users").document(u.uid).get().to_dict() or {}
        print(f"{u.uid}  志望={d.get('targetFacultyId')}  学年={d.get('grade')}  "
              f"育成EXP={d.get('growthExp', 0)}  段階={d.get('stage', 1)}  親密度={d.get('bond', 0)}")
    if not guests:
        print("ゲストのアカウントが見つかりません")


def cmd_set(uid: str, goal: str) -> None:
    if not is_guest(uid):
        sys.exit("ゲストのアカウントではないので書き換えません（本物の利用者のデータを守るため）")
    ref = db.collection("users").document(uid)
    user = ref.get().to_dict() or {}
    plan = user.get("plan")
    if not progress.has_plan(user):
        sys.exit("初期設定（plan）がまだのアカウントです")
    exp = max(0, target_exp(plan, goal) - MARGIN)
    stage, bond = progress.stage_and_bond(exp, plan)
    ref.set({"growthExp": exp, "stage": stage, "bond": bond}, merge=True)
    print(f"{uid} の育成EXPを {exp}（{goal} の {MARGIN} 手前）にしました。段階={stage} 親密度={bond}")
    print("アプリで30分以上の記録を1回すると、進化（または親密度アップ）が起きます")


if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "list":
        cmd_list()
    elif len(sys.argv) == 4 and sys.argv[1] == "set":
        cmd_set(sys.argv[2], sys.argv[3])
    else:
        print(__doc__)
        sys.exit(1)
