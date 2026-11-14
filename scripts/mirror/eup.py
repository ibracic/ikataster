#!/usr/bin/env python3
"""Spatial plan units (EUP, enote urejanja prostora) for the mirror.

usage:
  eup.py harvest <work>         download all EUP_OPN polygons from the MNVP WFS (bbox tiles, split when full) -> <work>/eup.jsonl
  eup.py apply <work> <site> [ko...]  assign an EUP to every parcel (parcel point e/n inside polygon) -> KO keys "plans" + "eu"

Same rule as the app's former live lookup: INTERSECTS(GEOM, parcel point); if several units overlap, the lowest FEATUREID wins.
Only plan unit codes and plan names (public spatial plans, no personal data).
"""
import json, os, sys, time, urllib.request, urllib.parse

WFS = "https://ipi.eprostor.gov.si/wfs-si-mnvp-pa/wfs"
UA = "ikataster-mirror/1"
SI = (370000, 25000, 630000, 200000)  # D96/TM bbox of Slovenia
PAGE = 300


def get(params, tries=6):
    url = WFS + "?" + urllib.parse.urlencode(params)
    for t in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            if t == tries - 1: raise
            print(f"retry {t + 1}: {e}", flush=True); time.sleep(5 * (t + 1))


def harvest(work):
    out = f"{work}/eup.jsonl"
    seen, n_req = set(), 0
    stack = []
    step = 10000
    for x in range(SI[0], SI[2], step):
        for y in range(SI[1], SI[3], step):
            stack.append((x, y, x + step, y + step))
    with open(out + ".tmp", "w", encoding="utf-8") as fh:
        while stack:
            b = stack.pop()
            d = get({"service": "WFS", "version": "2.0.0", "request": "GetFeature", "typeNames": "SI.MNVP.PA:EUP_OPN",
                     "count": PAGE, "outputFormat": "application/json", "propertyName": "EUP_OZN,NAZIV_PA,GEOM",
                     "bbox": f"{b[0]},{b[1]},{b[2]},{b[3]},EPSG:3794"})
            n_req += 1
            feats = d.get("features", [])
            matched = d.get("numberMatched")
            if (isinstance(matched, int) and matched > len(feats)) or len(feats) >= PAGE:
                mx, my = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
                stack += [(b[0], b[1], mx, my), (mx, b[1], b[2], my), (b[0], my, mx, b[3]), (mx, my, b[2], b[3])]
                continue
            for f in feats:
                fid = f["properties"].get("FEATUREID")
                if fid in seen or not f.get("geometry"): continue
                seen.add(fid)
                g = f["geometry"]
                polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]] if g["type"] == "Polygon" else []
                polys = [[[[round(c[0], 1), round(c[1], 1)] for c in ring] for ring in poly] for poly in polys]
                fh.write(json.dumps({"id": fid, "code": f["properties"].get("EUP_OZN"), "plan": f["properties"].get("NAZIV_PA"), "g": polys},
                                    separators=(",", ":"), ensure_ascii=False) + "\n")
            if n_req % 100 == 0: print(f"requests {n_req}, units {len(seen)}, queue {len(stack)}", flush=True)
            time.sleep(0.2)
    os.replace(out + ".tmp", out)
    print(f"done: requests {n_req}, units {len(seen)}")
    if len(seen) < 50000: sys.exit(f"too few units ({len(seen)}), refusing")


def inside(x, y, ring):
    c = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]; xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi: c = not c
        j = i
    return c


def apply(work, site, only=None):
    CELL = 2000
    units, grid = [], {}
    with open(f"{work}/eup.jsonl", encoding="utf-8") as fh:
        for line in fh:
            u = json.loads(line)
            if not u["code"]: continue
            xs = [c[0] for p in u["g"] for c in p[0]]; ys = [c[1] for p in u["g"] for c in p[0]]
            if not xs: continue
            bb = (min(xs), min(ys), max(xs), max(ys))
            k = len(units)
            units.append((u["id"], u["code"], u["plan"] or "", bb, u["g"]))
            for gx in range(int(bb[0] // CELL), int(bb[2] // CELL) + 1):
                for gy in range(int(bb[1] // CELL), int(bb[3] // CELL) + 1):
                    grid.setdefault((gx, gy), []).append(k)
    for v in grid.values(): v.sort(key=lambda k: units[k][0])
    print(f"units {len(units)}", flush=True)

    def find(x, y):
        for k in grid.get((int(x // CELL), int(y // CELL)), ()):
            _, _, _, bb, g = units[k]
            if not (bb[0] <= x <= bb[2] and bb[1] <= y <= bb[3]): continue
            for poly in g:
                if inside(x, y, poly[0]) and not any(inside(x, y, h) for h in poly[1:]): return k
        return None

    ko_dir = f"{site}/ko"
    total = hit = 0
    for f in sorted(os.listdir(ko_dir)):
        if f == "index.json" or not f.endswith(".json"): continue
        if only and f[:-5] not in only: continue
        path = f"{ko_dir}/{f}"
        with open(path, encoding="utf-8") as fh: doc = json.load(fh)
        plans, plan_ix, eu = [], {}, {}
        for r in doc["p"]:
            total += 1
            k = find(r[4], r[5])
            if k is None: continue
            hit += 1
            _, code, plan, _, _ = units[k]
            if plan not in plan_ix: plan_ix[plan] = len(plans); plans.append(plan)
            eu[r[0]] = [code, plan_ix[plan]]
        doc["plans"], doc["eu"] = plans, eu
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh: json.dump(doc, fh, separators=(",", ":"), ensure_ascii=False)
        os.replace(tmp, path)
    print(f"parcels {total}, with EUP {hit}")


if __name__ == "__main__":
    if sys.argv[1] == "harvest": harvest(sys.argv[2])
    elif sys.argv[1] == "apply": apply(sys.argv[2], sys.argv[3], set(sys.argv[4:]) or None)
    else: sys.exit(__doc__)
