#!/usr/bin/env python3
"""Turn GURS national KN GeoJSONSeq exports into compact tippecanoe inputs.

parcele.geojsonl  (KO_ID, ST_PARCELE)       -> parcels.geojsonl   {ko, n}
nadzemni/tloris   (EID_STAVBA) + stavbe.csv -> buildings.geojsonl {ko, n}
ko.geojsonl       (KO_ID, NAZIV)            -> kos.geojsonl       {ko, name}

Source: Geodetska uprava Republike Slovenije, kataster nepremičnin (CC BY 4.0).
Owner files (imetniki, osebe) are never read.
"""
import csv, json, sys, os

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)

def feats(path):
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip().lstrip("\x1e")
            if line:
                yield json.loads(line)

def write(path, rows):
    n = 0
    with open(path, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, separators=(",", ":"), ensure_ascii=False) + "\n")
            n += 1
    print(path, n, flush=True)

def feature(geom, props, minzoom):
    return {"type": "Feature", "geometry": geom, "properties": props, "tippecanoe": {"minzoom": minzoom}}

write(f"{out}/kos.geojsonl", (feature(x["geometry"], {"ko": int(x["properties"]["KO_ID"]), "name": x["properties"]["NAZIV"]}, 8)
                               for x in feats(f"{src}/ko.geojsonl") if x.get("geometry")))

ids = {}
with open(f"{src}/stavbe.csv", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        try:
            ids[r["EID_STAVBA"]] = (int(float(r["KO_ID"])), int(float(r["ST_STAVBE"])))
        except (TypeError, ValueError):
            pass
print("buildings known", len(ids), flush=True)

def buildings():
    seen = set()
    for name in ("nadzemni", "tloris"):  # above-ground outline first, plain outline as fallback
        for x in feats(f"{src}/{name}.geojsonl"):
            eid = x["properties"].get("EID_STAVBA")
            if eid in seen or eid not in ids or not x.get("geometry"):
                continue
            if name == "nadzemni":
                seen.add(eid)
            ko, n = ids[eid]
            yield feature(x["geometry"], {"ko": ko, "n": n}, 14)
write(f"{out}/buildings.geojsonl", buildings())

write(f"{out}/parcels.geojsonl", (feature(x["geometry"], {"ko": int(x["properties"]["KO_ID"]), "n": x["properties"]["ST_PARCELE"]}, 14)
                                  for x in feats(f"{src}/parcele.geojsonl") if x.get("geometry")))
