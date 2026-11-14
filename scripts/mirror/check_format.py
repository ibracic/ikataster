#!/usr/bin/env python3
"""Check mirror KO files against format.json (the contract shared with the web decoder).

usage: check_format.py <site> [--all] [--sample <ko> <building> <out.json>]
Checks ko/index.json and KO files (default: a spread of 40 KOs incl. the largest; --all = every KO).
--sample writes a small real KO file (a few parcels + one whole building) used by the web contract test.
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
FMT = json.load(open(f"{HERE}/format.json"))
errors = []

def ok_type(v, t):
    if t.endswith("?"):
        if v is None: return True
        t = t[:-1]
    return {
        "int": lambda: isinstance(v, int) and not isinstance(v, bool),
        "num": lambda: isinstance(v, (int, float)) and not isinstance(v, bool),
        "str": lambda: isinstance(v, str),
        "yn": lambda: v in (0, 1),
        "list": lambda: isinstance(v, list),
        "bbox": lambda: isinstance(v, list) and len(v) == 4,
        "geom": lambda: isinstance(v, list) and all(isinstance(r, list) and all(isinstance(c, list) and len(c) % 2 == 0 for c in r) for r in v),
    }[t]()

def rows(where, data, cols):
    for i, r in enumerate(data):
        if len(r) != len(cols):
            errors.append(f"{where}[{i}]: {len(r)} fields, expected {len(cols)}"); return
        for (name, t), v in zip(cols, r):
            if not ok_type(v, t):
                errors.append(f"{where}[{i}].{name}: {v!r} is not {t}"); return

def check_ko(doc, where):
    f = FMT["ko"]
    if doc.get("v") != FMT["version"]: errors.append(f"{where}: version {doc.get('v')}")
    missing = [k for k in f["keys"] if k not in doc]
    extra = [k for k in doc if k not in f["keys"]]
    if missing or extra: errors.append(f"{where}: keys missing {missing} extra {extra}")
    rows(f"{where}.p", doc.get("p", []), f["p"])
    rows(f"{where}.b", doc.get("b", []), f["b"])
    for b, rs in doc.get("d", {}).items(): rows(f"{where}.d[{b}]", rs, f["d"])
    for p, r in doc.get("pe", {}).items(): rows(f"{where}.pe[{p}]", [r], f["pe"])
    for b, rs in doc.get("de", {}).items(): rows(f"{where}.de[{b}]", rs, f["de"])

def main():
    site = sys.argv[1]
    idx = json.load(open(f"{site}/ko/index.json"))
    if list(idx) != FMT["index"]["keys"]: errors.append(f"index keys {list(idx)}")
    missing = [c for c in FMT["index"]["codes"] if c not in idx["codes"]]
    if missing: errors.append(f"index codes missing {missing}")
    rows("index.kos", idx["kos"], FMT["index"]["kos"])
    if "--sample" in sys.argv:
        i = sys.argv.index("--sample"); ko, bld, out = sys.argv[i + 1], sys.argv[i + 2], sys.argv[i + 3]
        doc = json.load(open(f"{site}/ko/{ko}.json"))
        check_ko(doc, f"ko/{ko}")
        b = [r for r in doc["b"] if str(r[0]) == bld]
        p = [r for r in doc["p"] if r[0] in doc["pe"] and any(str(x[1]) == bld for x in doc["pe"][r[0]][2])][:2]
        sample = {"v": doc["v"], "ko": doc["ko"], "date": doc["date"], "src": doc["src"],
                  "managers": {},
                  "p": p, "b": b, "d": {bld: doc["d"][bld]},
                  "pe": {r[0]: doc["pe"][r[0]] for r in p}, "de": {bld: doc["de"].get(bld, [])}}
        sample["managers"] = {k: v for k, v in doc["managers"].items() if any(str(r[13]) == k for r in doc["d"][bld])}
        keep = {"landUse", "intended"} | set(FMT["index"]["codes"])
        codes = {k: v for k, v in idx["codes"].items() if k in keep}
        check_ko(sample, "sample")
        json.dump({"codes": codes, "doc": sample}, open(out, "w"), ensure_ascii=False, indent=0, separators=(",", ":"))
    else:
        kos = sorted(idx["kos"], key=lambda k: -k[3])
        pick = kos if "--all" in sys.argv else kos[:5] + kos[5::max(1, len(kos) // 35)]
        for k in pick: check_ko(json.load(open(f"{site}/ko/{k[0]}.json")), f"ko/{k[0]}")
        print(f"checked index + {len(pick)} KO files")
    if errors:
        print("\n".join(errors[:30]), file=sys.stderr); sys.exit(1)

main()
