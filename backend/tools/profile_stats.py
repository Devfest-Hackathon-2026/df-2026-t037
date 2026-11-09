"""学部の紹介文の「書き方のばらつき」を数字で見る。

広く・長く書かれた紹介文は、どんな質問にも近く出やすい（ハブネス）。
長さ・キーワード数が極端な学部を探し、書き直しの候補にする。

    cd ~/my-hackathon-app/backend
    python3 tools/profile_stats.py
"""
from __future__ import annotations

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
P = json.loads((ROOT / "faculty_profiles.json").read_text(encoding="utf-8"))


def stat(xs):
    m = sum(xs) / len(xs)
    sd = math.sqrt(sum((x - m) ** 2 for x in xs) / len(xs)) or 1.0
    return m, sd


rows = [(fid, p["university"], p["faculty"], len(p.get("summary", "")), len(p.get("keywords") or []),
         bool(p.get("sourceIsOfficial")), p.get("sourceCheck", "")) for fid, p in P.items()]
lm, lsd = stat([r[3] for r in rows])
km, ksd = stat([r[4] for r in rows])
print(f"紹介文の長さ：平均 {lm:.0f}字／ばらつき {lsd:.0f}字／最短 {min(r[3] for r in rows)}／最長 {max(r[3] for r in rows)}")
print(f"キーワード数：平均 {km:.1f}個／ばらつき {ksd:.1f}個")

print("\n--- 長さが平均から大きく外れた学部（1.5σ超）---")
for fid, u, f, n, k, off, chk in sorted(rows, key=lambda r: -abs(r[3] - lm)):
    z = (n - lm) / lsd
    if abs(z) > 1.5:
        print(f"{'長い' if z > 0 else '短い'} {n:>4}字  {u} {f}  ({fid})")

print("\n--- キーワードが極端に少ない・多い学部 ---")
for fid, u, f, n, k, off, chk in rows:
    if k < 5 or k > 9:
        print(f"{k}個  {u} {f}  ({fid})")

print("\n--- 大学ごとの平均の長さ（大学によって書き方が違わないか）---")
by = {}
for r in rows:
    by.setdefault(r[1], []).append(r[3])
for u, xs in sorted(by.items(), key=lambda x: -sum(x[1]) / len(x[1])):
    print(f"{u:<8} 平均 {sum(xs) / len(xs):>4.0f}字（{len(xs)}学部）")

ok = sum(1 for r in rows if r[6] == "OK")
off = sum(1 for r in rows if r[5])
print(f"\n出典の検査OK：{ok}／{len(rows)}件　公式URLを表示：{off}件")
