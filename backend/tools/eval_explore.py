# File: backend/tools/eval_explore.py
"""学部検索のランク付け方式を、テスト問題集（eval_cases.py）で比べる。Cloud Shell の backend/ で実行する。

    python3 -u tools/eval_explore.py            # 初回は約120件をベクトル化（数分）。結果は eval_cache.json に保存
    python3 -u tools/eval_explore.py --report   # 比べた結果を表で出す（ベクトル化はキャッシュを使う）

比べる方式（全部、学部側のベクトルは今のまま。質問側の変え方と、順位の補正のしかたを変える）
  raw        そのままコサイン類似度（今の本番の前の方式）
  hubN       学部どうしの「近くなりやすさ」を引く（強さ N）…いまデプロイ中の方式は hub1
  center     全学部の平均を引いてから比べる（前に試して悪化した方式）
  mean       各学部が「質問全体にどれだけ近くなりやすいか」の平均を引く
  z          上の平均と、ばらつきで割る（z スコア）
  csls       各学部の「近い質問10件の平均」を引く（CSLS）
いずれも、補正に使う質問は「その問題以外の問題」の文章だけ（答えを見て補正しないため：1問ぬき交差検証）。

指標（高いほどよい）
  P@5   上位5件のうち、その関心で「出ていておかしくない学部」の割合
  hit1  1位がそれに入っている割合
  hubFP 広く書かれた学部（国際教養など上位6つ）が、出ていておかしくないのに入っていない形で上位5に混ざった数
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import explore  # noqa: E402
from eval_cases import CASES  # noqa: E402

PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "pivotal-pager-514008-d0")
CACHE = Path(__file__).resolve().parent / "eval_cache.json"
RANK_WEIGHT = {"S": 3.0, "A": 2.0, "B": 1.0, "C": 0.3}


def _token() -> str:
    import google.auth
    import google.auth.transport.requests
    creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    creds.refresh(google.auth.transport.requests.Request())
    return creds.token


def _key(text: str) -> str:
    return hashlib.sha1(f"{explore.EMBED_MODEL}|{text}".encode("utf-8")).hexdigest()


def load_vectors(texts: list[str]) -> dict[str, list[float]]:
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    todo = [t for t in dict.fromkeys(texts) if _key(t) not in cache]
    if todo:
        token = _token()
        print(f"{len(todo)}件をベクトル化します…", flush=True)

        def one(t: str):
            for _ in range(3):
                try:
                    return t, explore.embed_query(t, PROJECT_ID, token)
                except Exception:
                    continue
            return t, None

        with ThreadPoolExecutor(max_workers=4) as ex:
            for i, (t, v) in enumerate(ex.map(one, todo), 1):
                if v:
                    cache[_key(t)] = v
                if i % 20 == 0:
                    print(f"  {i}/{len(todo)}", flush=True)
        CACHE.write_text(json.dumps(cache))
    return {t: cache[_key(t)] for t in texts if _key(t) in cache}


def unit(v):
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def aggregate(case, vecs):
    """本番の memory.interest_vector と同じ重み付き平均（ランク×時間）"""
    dim = len(next(iter(vecs.values())))
    acc = [0.0] * dim
    for subj, rank, minutes, text in case["logs"]:
        w = RANK_WEIGHT.get(rank, 1.0) * math.log1p(max(1, minutes))
        for i, x in enumerate(unit(vecs[text])):
            acc[i] += w * x
    return acc


def top5(scores: dict[str, float]):
    picked, per = [], {}
    for fid, s in sorted(scores.items(), key=lambda x: x[1], reverse=True):
        u = explore.PROFILES[fid]["universityId"]
        if per.get(u, 0) >= explore.PER_UNIVERSITY_MAX:
            continue
        per[u] = per.get(u, 0) + 1
        picked.append(fid)
        if len(picked) == 5:
            break
    return picked


def main(report_only: bool):
    ids = list(explore.VECTORS)
    U = {f: unit(explore.VECTORS[f]) for f in ids}

    texts = []
    for c in CASES:
        texts.append(c["interest"])
        texts += [l[3] for l in c["logs"]]
    vecs = load_vectors(texts)
    missing = [t for t in texts if t not in vecs]
    if missing:
        sys.exit(f"{len(missing)}件のベクトル化に失敗しました。もう一度実行してください（結果は途中まで保存されています）")

    # 学部どうしの「近くなりやすさ」（hubN 用）
    M = [sum(U[f][i] for f in ids) / len(ids) for i in range(len(U[ids[0]]))]
    hub = {f: dot(U[f], M) for f in ids}
    hub_avg = sum(hub.values()) / len(hub)
    top_hubs = set(sorted(ids, key=lambda f: hub[f], reverse=True)[:6])
    doc_mean = M
    cen = {f: [a - m for a, m in zip(explore.VECTORS[f], doc_mean)] for f in ids}

    # 質問（1件ずつ）と、問題ごとの合算ベクトル
    single = {}   # case_id -> [unit vec of each text incl. interest]
    agg = {}
    for c in CASES:
        single[c["id"]] = [unit(vecs[c["interest"]])] + [unit(vecs[l[3]]) for l in c["logs"]]
        agg[c["id"]] = unit(aggregate(c, vecs))

    def calib(exclude_id: str, use_agg: bool):
        """その問題以外の質問から、各学部の（平均・ばらつき・近い10件の平均）を求める"""
        refs = []
        for cid in single:
            if cid == exclude_id:
                continue
            refs += [agg[cid]] if use_agg else single[cid]
        out = {}
        for f in ids:
            cs = sorted((dot(q, U[f]) for q in refs), reverse=True)
            mu = sum(cs) / len(cs)
            sd = math.sqrt(sum((x - mu) ** 2 for x in cs) / len(cs)) or 1e-6
            k = max(1, min(10, len(cs)))
            out[f] = (mu, sd, sum(cs[:k]) / k)
        return out

    def scorer(name, case_id):
        if name == "raw":
            return lambda q: {f: dot(q, U[f]) for f in ids}
        if name.startswith("hub"):
            lam = float(name[3:])
            return lambda q: {f: dot(q, U[f]) - lam * (hub[f] - hub_avg) for f in ids}
        if name == "center":
            def fn(q):
                qc = [a - m for a, m in zip(q, doc_mean)]
                return {f: dot(qc, cen[f]) / ((math.sqrt(dot(qc, qc)) or 1) * (math.sqrt(dot(cen[f], cen[f])) or 1)) for f in ids}
            return fn
        kind, src = name.split("@")  # 例: mean@agg, z@single, csls@agg
        cal = calib(case_id, src == "agg")
        if kind == "mean":
            return lambda q: {f: dot(q, U[f]) - cal[f][0] for f in ids}
        if kind == "z":
            return lambda q: {f: (dot(q, U[f]) - cal[f][0]) / cal[f][1] for f in ids}
        if kind == "csls":
            return lambda q: {f: 2 * dot(q, U[f]) - cal[f][2] for f in ids}
        raise ValueError(name)

    variants = ["raw", "hub1", "hub2", "hub4", "center",
                "mean@single", "mean@agg", "z@single", "z@agg", "csls@single", "csls@agg"]

    results = {}
    detail = {}
    for v in variants:
        rows = {"logs": [], "interest": []}
        for c in CASES:
            fn = scorer(v, c["id"])
            exp = set(c["expect"])
            for kind, q in (("logs", agg[c["id"]]), ("interest", unit(vecs[c["interest"]]))):
                t5 = top5(fn(q))
                p = sum(1 for f in t5 if f in exp) / 5
                h1 = 1.0 if t5[0] in exp else 0.0
                fp = sum(1 for f in t5 if f in top_hubs and f not in exp)
                rows[kind].append((p, h1, fp))
                detail[(v, c["id"], kind)] = t5
        results[v] = rows

    print("\n=== 方式の比べあい（30問）===")
    print(f"{'方式':<14}{'記録P@5':>9}{'記録hit1':>10}{'記録hubFP':>10}  {'言葉P@5':>8}{'言葉hit1':>9}{'言葉hubFP':>10}  {'総合P@5':>8}")
    best = None
    for v in variants:
        def m(kind, i):
            r = results[v][kind]
            return sum(x[i] for x in r) / len(r)
        pl, p1, pf = m("logs", 0), m("logs", 1), sum(x[2] for x in results[v]["logs"])
        il, i1, ifp = m("interest", 0), m("interest", 1), sum(x[2] for x in results[v]["interest"])
        tot = (pl + il) / 2
        print(f"{v:<14}{pl:>9.3f}{p1:>10.2f}{pf:>10d}  {il:>8.3f}{i1:>9.2f}{ifp:>10d}  {tot:>8.3f}")
        if best is None or tot > best[0]:
            best = (tot, v)
    print(f"\n総合P@5が最も高い方式：{best[1]}（{best[0]:.3f}）")

    nm = lambda f: explore.PROFILES[f]["university"] + explore.PROFILES[f]["faculty"]
    for cid in ("mixed-science-english", "mixed-humanities-english", "space-physics", "pharmacy"):
        print(f"\n--- {cid}（記録から）---")
        for v in ("raw", "hub1", best[1]):
            print(f"{v:>12}: " + " / ".join(nm(f).replace("大学", "").replace("義塾", "") for f in detail[(v, cid, 'logs')]))

    # 本番用の補正値を、全問から作って保存する（best が mean/z/csls のときに explore.py が使う）
    refs_single = [q for cid in single for q in single[cid]]
    refs_agg = [agg[cid] for cid in agg]
    out = {"model": explore.EMBED_MODEL, "n_single": len(refs_single), "n_agg": len(refs_agg), "single": {}, "agg": {}}
    for label, refs in (("single", refs_single), ("agg", refs_agg)):
        for f in ids:
            cs = sorted((dot(q, U[f]) for q in refs), reverse=True)
            mu = sum(cs) / len(cs)
            sd = math.sqrt(sum((x - mu) ** 2 for x in cs) / len(cs)) or 1e-6
            out[label][f] = {"mu": round(mu, 5), "sd": round(sd, 5), "top10": round(sum(cs[:10]) / min(10, len(cs)), 5)}
    (ROOT / "faculty_calibration.json").write_text(json.dumps(out, ensure_ascii=False))
    print("\n補正値を faculty_calibration.json に保存しました（採用する方式が決まったら explore.py が読みます）")


if __name__ == "__main__":
    main("--report" in sys.argv)
