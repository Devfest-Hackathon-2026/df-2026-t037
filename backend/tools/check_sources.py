"""学部の紹介文の出典URLを、実際に開いて検査する。

使い方（インターネットに出られる場所＝Cloud Shell で）:
    cd ~/my-hackathon-app/backend
    python3 tools/check_sources.py            # 全学部を検査して表を出す
    python3 tools/check_sources.py todai-r1   # 学部IDを指定

見ること（機械でわかる範囲だけ）
  1. URLが開けるか（HTTP 200）
  2. ページの文字に、その学部の名前が出てくるか
結果:  OK … 開けて、学部名も書いてある
       名前なし … 開けたが学部名が見つからない（別のページの可能性。目で確認）
       開けない … エラー。URLを直す
JavaScriptで表示されるページは「名前なし」になることがある。最終判断は人が目で見る。
結果は ~/source_check.tsv にも保存する。
"""
from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
PROFILES = json.loads((ROOT / "faculty_profiles.json").read_text(encoding="utf-8"))
UA = {"User-Agent": "Mozilla/5.0 (study-cockpit source check; contact: team)"}


def name_tokens(faculty: str) -> list[str]:
    """学部名から、ページに出てきてほしい言葉を作る（（A方式）などは外す）"""
    base = re.sub(r"[（(].*?[）)]", "", faculty).strip()
    parts = [p for p in re.split(r"\s+", base) if p]
    # 「医学部 保健衛生学科 看護学専攻」のように複数あるときは、いちばん細かい名前
    return [parts[-1]] if parts else []


def page_text(html: str) -> str:
    html = re.sub(r"(?is)<(script|style).*?</\1>", " ", html)
    return re.sub(r"<[^>]+>", " ", html)


def check(fid: str, p: dict) -> tuple[str, str, str]:
    url = p.get("sourceUrl") or ""
    if not url:
        return "URLなし", "", ""
    try:
        r = requests.get(url, headers=UA, timeout=20)
    except Exception as e:  # noqa: BLE001
        return "開けない", url, type(e).__name__
    if r.status_code != 200:
        return "開けない", url, f"HTTP {r.status_code}"
    r.encoding = r.apparent_encoding or r.encoding
    text = page_text(r.text)
    tokens = name_tokens(p["faculty"])
    if all(t in text for t in tokens):
        return "OK", url, ""
    return "名前なし", url, "ページに「" + "」「".join(tokens) + "」が見つからない"


def main() -> None:
    ids = sys.argv[1:] or list(PROFILES)
    rows = []
    for fid in ids:
        p = PROFILES.get(fid)
        if not p:
            print(f"{fid}: 学部IDが見つかりません")
            continue
        status, url, note = check(fid, p)
        rows.append((fid, p["university"], p["faculty"], status, note, url))
        print(f"{status:<6} {p['university']} {p['faculty']}  {note}")
        time.sleep(0.5)
    out = Path.home() / "source_check.tsv"
    out.write_text("\n".join("\t".join(r) for r in rows), encoding="utf-8")
    ng = [r for r in rows if r[3] != "OK"]
    print(f"\n検査 {len(rows)}件／OK {len(rows) - len(ng)}件／要確認 {len(ng)}件（{out} に保存）")


if __name__ == "__main__":
    main()
