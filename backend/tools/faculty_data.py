# File: backend/tools/faculty_data.py
"""79学部の紹介文（下書き）と、意味の近さを測るためのベクトルを作るスクリプト。

Cloud Shell で backend/ から実行する（Vertex AI の権限が必要）:
    python3 tools/faculty_data.py profiles      # 紹介文の下書き（途中から再開できる）
    python3 tools/faculty_data.py check         # 出典URLの確認状況を一覧で出す
    python3 tools/faculty_data.py embeddings    # 紹介文をベクトルにする（紹介文を直したら作り直す）

方針（Own the Why）
- 紹介文は「Gemini＋Google検索によるグラウンディング」で、各大学の公式ページを根拠に下書きする。
  出典URLが大学の公式ドメインでなければ needsReview を付け、チームが必ず確認する。
- 下書きは reviewed: false で保存する。チームが公式ページと読み比べて直したら reviewed: true にする。
- 画面には「出典：各大学の公式ページ」と、その学部の出典URLを表示する。
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

import google.auth
import requests
from google.auth.transport.requests import Request

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from game_rules import FACULTIES, UNIVERSITIES  # noqa: E402

PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "pivotal-pager-514008-d0")
MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.8-flash")
LOCATION = os.environ.get("GEMINI_LOCATION", "global")
EMBED_MODEL = os.environ.get("EMBED_MODEL", "gemini-embedding-001")
EMBED_LOCATION = os.environ.get("EMBED_LOCATION", "us-central1")
EMBED_DIM = int(os.environ.get("EMBED_DIM", "768"))

PROFILES_PATH = ROOT / "faculty_profiles.json"
EMBEDDINGS_PATH = ROOT / "faculty_embeddings.json"

# 大学の公式ドメイン（出典URLがこれ以外なら要確認にする）
OFFICIAL_DOMAINS = {
    "todai": ["u-tokyo.ac.jp"],
    "kagaku": ["isct.ac.jp", "titech.ac.jp", "tmd.ac.jp"],
    "chiba": ["it-chiba.ac.jp"],
    "keio": ["keio.ac.jp"],
    "hitotsu": ["hit-u.ac.jp"],
    "tufs": ["tufs.ac.jp"],
    "waseda": ["waseda.jp"],
    "kyoto": ["kyoto-u.ac.jp"],
    "osaka": ["osaka-u.ac.jp"],
}

credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])


def token() -> str:
    if not credentials.valid:
        credentials.refresh(Request())
    return credentials.token


def headers() -> dict:
    return {"Authorization": f"Bearer {token()}", "X-Goog-User-Project": PROJECT_ID, "Content-Type": "application/json"}


def is_official(uni_id: str, url: str) -> bool:
    host = (urlparse(url or "").hostname or "").lower()
    return any(host == d or host.endswith("." + d) for d in OFFICIAL_DOMAINS.get(uni_id, []))


def load_json(path: Path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def save_json(path: Path, data, compact: bool = False) -> None:
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":")) if compact else json.dumps(data, ensure_ascii=False, indent=1)
    path.write_text(text + "\n", encoding="utf-8")


# ---- 1. 紹介文の下書き（Gemini＋Google検索） ----
PROFILE_PROMPT = """あなたは高校生向けの進路情報を作る編集者です。
Google検索で「{uni} {faculty}」の公式ウェブサイト（大学の公式ドメインのページ）を探し、その内容だけを根拠に、
高校生がその学部で「何を学べるか」がわかる紹介文を作ってください。

条件
- 公式ページに書かれていないこと（偏差値・就職率・評判など）は書かない。推測しない。
- summary：何を学ぶ学部か。2文・120字以内。やさしい日本語で。
- keywords：学べる分野や研究テーマのキーワードを6〜8個（各10字以内）。
- sourceUrl：根拠にした公式ページのURL（学部の紹介ページが望ましい）。見つからなければ空文字。

次のJSONだけを ```json のコードブロックで出力してください。
{{"summary": "...", "keywords": ["...", "..."], "sourceUrl": "https://..."}}"""


def draft_profile(fid: str) -> dict:
    f = FACULTIES[fid]
    uni = UNIVERSITIES[f["universityId"]]
    url = (f"https://aiplatform.googleapis.com/v1/projects/{PROJECT_ID}/locations/{LOCATION}"
           f"/publishers/google/models/{MODEL}:generateContent")
    body = {
        "contents": [{"role": "user", "parts": [{"text": PROFILE_PROMPT.format(uni=uni["name"], faculty=f["name"])}]}],
        "tools": [{"googleSearch": {}}],
    }
    r = requests.post(url, headers=headers(), json=body, timeout=90)
    r.raise_for_status()
    cand = r.json()["candidates"][0]
    text = "".join(p.get("text", "") for p in cand.get("content", {}).get("parts", []))
    m = re.search(r"\{[\s\S]*\}", text)
    data = json.loads(m.group(0)) if m else {}
    # 検索で実際に参照したページのタイトル（グラウンディングのメタデータ）も残す。確認作業の手がかりにする
    chunks = (cand.get("groundingMetadata") or {}).get("groundingChunks") or []
    titles = [c.get("web", {}).get("title") for c in chunks if c.get("web", {}).get("title")]
    src = (data.get("sourceUrl") or "").strip()
    return {
        "id": fid,
        "universityId": f["universityId"],
        "university": uni["name"],
        "faculty": f["name"],
        "summary": (data.get("summary") or "").strip(),
        "keywords": [str(k).strip() for k in (data.get("keywords") or []) if str(k).strip()][:8],
        "sourceUrl": src,
        "sourceIsOfficial": is_official(f["universityId"], src),
        "groundingTitles": titles[:5],
        "reviewed": False,
        "draftedBy": MODEL,
        "draftedAt": time.strftime("%Y-%m-%d"),
    }


def cmd_profiles() -> None:
    profiles = load_json(PROFILES_PATH, {})
    todo = [fid for fid in FACULTIES if fid not in profiles or not profiles[fid].get("summary")]
    print(f"{len(FACULTIES)}学部のうち {len(todo)} 件を下書きします")
    for i, fid in enumerate(todo, 1):
        for attempt in range(3):
            try:
                p = draft_profile(fid)
                break
            except Exception as e:  # ネットワークや形式の失敗は2回まで再試行する
                print(f"  [{fid}] 失敗（{attempt + 1}回目）: {e.__class__.__name__}")
                time.sleep(3)
        else:
            continue
        profiles[fid] = p
        save_json(PROFILES_PATH, profiles)  # 1件ごとに保存（途中で止まっても再開できる）
        flag = "OK" if p["sourceIsOfficial"] else "要確認"
        print(f"{i:>2}/{len(todo)} {p['university']} {p['faculty']} … {flag} {p['sourceUrl']}")
        time.sleep(1)
    cmd_check()


def cmd_check() -> None:
    profiles = load_json(PROFILES_PATH, {})
    missing = [fid for fid in FACULTIES if fid not in profiles]
    need = [p for p in profiles.values() if not p.get("sourceIsOfficial") or not p.get("summary")]
    done = [p for p in profiles.values() if p.get("reviewed")]
    print(f"下書き {len(profiles)}/{len(FACULTIES)}・チーム確認済み {len(done)}・出典の要確認 {len(need)}・未作成 {len(missing)}")
    for p in need:
        print(f"  要確認: {p['id']} {p['university']} {p['faculty']} {p.get('sourceUrl') or '(出典なし)'}")


# ---- 2. ベクトル（Vertex AI のテキスト埋め込み） ----
def profile_text(p: dict) -> str:
    return f"{p['university']} {p['faculty']}。{p['summary']} キーワード：{'、'.join(p.get('keywords') or [])}"


def embed(text: str, task: str) -> list[float]:
    url = (f"https://{EMBED_LOCATION}-aiplatform.googleapis.com/v1/projects/{PROJECT_ID}/locations/{EMBED_LOCATION}"
           f"/publishers/google/models/{EMBED_MODEL}:predict")
    body = {"instances": [{"content": text, "task_type": task}], "parameters": {"outputDimensionality": EMBED_DIM}}
    r = requests.post(url, headers=headers(), json=body, timeout=30)
    r.raise_for_status()
    return r.json()["predictions"][0]["embeddings"]["values"]


def cmd_embeddings() -> None:
    profiles = load_json(PROFILES_PATH, {})
    vectors = {}
    for i, (fid, p) in enumerate(profiles.items(), 1):
        if not p.get("summary"):
            continue
        vectors[fid] = [round(v, 5) for v in embed(profile_text(p), "RETRIEVAL_DOCUMENT")]
        print(f"{i:>2}/{len(profiles)} {p['university']} {p['faculty']}")
    save_json(EMBEDDINGS_PATH, {"model": EMBED_MODEL, "dim": EMBED_DIM, "vectors": vectors}, compact=True)
    print(f"{len(vectors)}件のベクトルを {EMBEDDINGS_PATH.name} に保存しました")


if __name__ == "__main__":
    cmds = {"profiles": cmd_profiles, "check": cmd_check, "embeddings": cmd_embeddings}
    if len(sys.argv) != 2 or sys.argv[1] not in cmds:
        print(__doc__)
        sys.exit(1)
    cmds[sys.argv[1]]()
