#!/usr/bin/env python3
"""Per-manager files for the iKataster mirror, derived from the per-KO files (site/ko/<ko>.json).

usage: managers.py <site-dir> <date>

  mgr/index.json  {v:1, date, src, m: [[id, name, parts, buildings, [ko...]]]}   (search, ~100 KB)
  mgr/<id>.json   {v:1, id, name, date, b: [[ko, number, eid, geom, [[part, eid, useId]]]]}
                  geom = same delta encoding as the KO files; one request opens a whole portfolio.

Source: Geodetska uprava Republike Slovenije, kataster nepremičnin (CC BY 4.0).
"""
import glob, json, os, sys
from collections import defaultdict

site, date = sys.argv[1], sys.argv[2]
SRC = f"Geodetska uprava Republike Slovenije, kataster nepremičnin, stanje {date}"
names = {}
by_mgr = defaultdict(list)          # id -> [[ko, number, eid, geom, parts]]
for path in sorted(glob.glob(f"{site}/ko/[0-9]*.json")):
    doc = json.load(open(path, encoding="utf-8"))
    ko = doc["ko"][0]
    for k, v in doc["managers"].items():
        names.setdefault(int(k), v)
    blds = {b[0]: b for b in doc["b"]}
    for bnum, rows in doc["d"].items():
        per = defaultdict(list)
        for r in rows:
            if r[13]:
                per[r[13]].append([r[0], r[1], r[2]])
        if not per:
            continue
        b = blds.get(int(bnum))
        for mid, parts in per.items():
            by_mgr[mid].append([ko, int(bnum), b[1] if b else None, b[15] if b else None, parts])
    del doc

out = f"{site}/mgr"
os.makedirs(out, exist_ok=True)
for f in glob.glob(f"{out}/*.json"):
    os.remove(f)
index = []
for mid, blds in by_mgr.items():
    blds.sort(key=lambda b: (b[0], b[1]))
    name = names.get(mid, "")
    with open(f"{out}/{mid}.json", "w", encoding="utf-8") as fh:
        json.dump({"v": 1, "id": mid, "name": name, "date": date, "src": SRC, "b": blds}, fh, ensure_ascii=False, separators=(",", ":"))
    index.append([mid, name, sum(len(b[4]) for b in blds), len(blds), sorted({b[0] for b in blds})])
index.sort(key=lambda m: -m[2])
with open(f"{out}/index.json", "w", encoding="utf-8") as fh:
    json.dump({"v": 1, "date": date, "src": SRC, "m": index}, fh, ensure_ascii=False, separators=(",", ":"))
print(f"managers {len(index)}, parts {sum(m[2] for m in index)}, buildings {sum(m[3] for m in index)}")
