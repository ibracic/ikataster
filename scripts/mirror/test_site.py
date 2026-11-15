#!/usr/bin/env python3
"""
usage: test_site.py <site> <out-dir>
Writes a tiny but real copy of the published cadastre (same files and format as /mirror) for the web
app's screen-flow tests: part of central Maribor (KO 657 around Koroška cesta and building 130),
manager 1298 with its two buildings (KO 657 + 683) and the matching address shard.
Real public GURS data only (no owner files exist in the copy).
"""
import json, os, sys

site, out = sys.argv[1], sys.argv[2]
# D96 e/n boxes: around parcel 1587 (Koroška cesta) and an area-selection block around building 130
BOXES = [(549250, 157760, 549350, 157850), (550000, 157900, 550180, 158040)]
MANAGER = 1298
inside = lambda e, n: any(b[0] <= e <= b[2] and b[1] <= n <= b[3] for b in BOXES)

def write(path, doc):
    p = os.path.join(out, path)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    json.dump(doc, open(p, "w"), ensure_ascii=False, separators=(",", ":"))

idx = json.load(open(f"{site}/ko/index.json"))
mgr = json.load(open(f"{site}/mgr/{MANAGER}.json"))
keep_b = {657: {130}, 683: set()}
for ko, num, *_ in mgr["b"]: keep_b.setdefault(ko, set()).add(num)

def subset(ko):
    doc = json.load(open(f"{site}/ko/{ko}.json"))
    p = [r for r in doc["p"] if inside(r[4], r[5])]
    pn = {r[0] for r in p}
    b = [r for r in doc["b"] if r[0] in keep_b.get(ko, ()) or inside(r[13], r[14])]
    bn = {str(r[0]) for r in b}
    eu = {k: v for k, v in doc.get("eu", {}).items() if k in pn}
    used = sorted({v[1] for v in eu.values()})
    d = {k: v for k, v in doc["d"].items() if k in bn}
    mids = {str(r[13]) for rows in d.values() for r in rows if r[13]}
    return {**{k: doc[k] for k in ("v", "ko", "date", "src")},
            "managers": {k: v for k, v in doc["managers"].items() if k in mids},
            "p": p, "b": b, "d": d,
            "pe": {k: v for k, v in doc.get("pe", {}).items() if k in pn},
            "de": {k: v for k, v in doc.get("de", {}).items() if k in bn},
            "plans": [doc["plans"][i] for i in used],
            "eu": {k: [v[0], used.index(v[1])] for k, v in eu.items()},
            "ob": doc.get("ob", []), "po": {k: v for k, v in doc.get("po", {}).items() if k in pn}}

def lonlat(geom):  # first vertex of an encoded polygon (ints of lon/lat * 1e6)
    return geom[0][0][0] / 1e6, geom[0][0][1] / 1e6
# Every KO whose bbox overlaps the boxes gets a file with its own real features inside them, so area
# and point lookups see exactly what production would.
pts = [lonlat(r[6]) for r in json.load(open(f"{site}/ko/657.json"))["p"] if inside(r[4], r[5])]
w, s_, e, n = min(x for x, _ in pts), min(y for _, y in pts), max(x for x, _ in pts), max(y for _, y in pts)
near = {k[0] for k in idx["kos"] if k[2][0] <= e and k[2][2] >= w and k[2][1] <= n and k[2][3] >= s_}
for ko in sorted(near | set(keep_b)): write(f"ko/{ko}.json", subset(ko))
# Whole KO index (real KO list/bboxes); only the KO files above exist, others answer 404.
write("ko/index.json", idx)
write(f"mgr/{MANAGER}.json", mgr)
mi = json.load(open(f"{site}/mgr/index.json"))
write("mgr/index.json", {**mi, "m": [m for m in mi["m"] if m[0] == MANAGER]})
addr = json.load(open(f"{site}/addr/ko.json"))
write("addr/ko.json", {**addr, "a": [a for a in addr["a"] if a[3] == "Maribor" and inside(a[5], a[6])]})
write("index.json", json.load(open(f"{site}/index.json")))
print("fixture site:", {k: len(v) for k, v in [("ko", keep_b)]}, sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(out) for f in fs), "bytes")
