#!/usr/bin/env python3
"""Per-KO cadastre files for the iKataster GURS mirror.

Writes <out>/ko/<ko>.json (parcels, buildings, building parts of one cadastral
municipality, geometry included) and <out>/ko/index.json (KO list with bbox).

Inputs in <src> (see build.sh): parcele.geojsonl (KO_ID, ST_PARCELE + geometry),
parcele_attr.csv, stavbe_full.csv (point layer, D96 X/Y), buildings.geojsonl from
prepare.py, KN_SLO_STAVBE_SLO_deli_stavb_*.csv, KN_SLO_STAVBE_SLO_upravniki_*.csv,
sifranti/*.CSV, ko.geojsonl.

Source: Geodetska uprava Republike Slovenije, kataster nepremičnin (CC BY 4.0).
Owner files (imetniki, osebe, pravice) are never read.

File format v1 (all arrays positional to keep files small):
  index.json: {"v":1, "date", "src", "codes": {"use":{id:name}, "type", "structure", "status", "areaMethod", "mgrStatus"},
               "kos": [[id, name, [w,s,e,n], parcels, buildings]]}
  <ko>.json: {"v":1, "ko":[id,name], "date":"YYYY-MM-DD", "src":"...",
   "managers": {id: name},
   "p": [[number, eid, area, soil, e, n, geom]],
   "b": [[number, eid, floors, flats, business, yearBuilt, facade, type, structure, el, water, sewage, gas, e, n, geom]],
   "d": {building: [[part, eid, use, area, usable, elevator, condo, flat, instYear, winYear, common, status, areaMethod, mgrId, mgrStatus]]}}
  geom = list of polygons, polygon = list of rings, ring = flat delta-encoded ints of lon/lat * 1e6.
  Yes/no fields: 1 yes, 0 no, null unknown.
"""
import csv, glob, json, os, sqlite3, sys

csv.field_size_limit(1 << 30)
src, out, date = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(f"{out}/ko", exist_ok=True)
SRC = f"Geodetska uprava Republike Slovenije, kataster nepremičnin, stanje {date}"


def codes(name):
    with open(f"{src}/sifranti/{name}.CSV", encoding="utf-8") as f:
        return {int(r["id"]): r["nazivSl"].strip() for r in csv.DictReader(f)}


YES = {1: 1, 2: 0}  # DA_NE: 1 Da, 2 Ne, 0 Ni podatka


def i(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def f2(v):
    try:
        return round(float(v), 2)
    except (TypeError, ValueError):
        return None


def pos(v):
    v = i(v)
    return v if v and v > 0 else None


def enc_ring(ring):
    out, px, py = [], 0, 0
    for x, y in ring:
        ix, iy = round(x * 1e6), round(y * 1e6)
        out += [ix - px, iy - py]
        px, py = ix, iy
    return out


def enc(g):
    polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"] if g["type"] == "MultiPolygon" else []
    return [[enc_ring(r) for r in poly] for poly in polys]


def feats(path):
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip().lstrip("\x1e")
            if line:
                yield json.loads(line)


db = sqlite3.connect(f"{out}/../kodata.sqlite")
db.executescript("""
PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;
DROP TABLE IF EXISTS p; DROP TABLE IF EXISTS b; DROP TABLE IF EXISTS d; DROP TABLE IF EXISTS g;
CREATE TABLE p(ko INT, n TEXT, row TEXT);
CREATE TABLE g(ko INT, n INT, geom TEXT);
CREATE TABLE b(ko INT, n INT, eid TEXT, row TEXT);
CREATE TABLE d(eidb TEXT, row TEXT);
""")

# parcels: attributes keyed by (ko, number), geometry streamed
attr = {}
with open(f"{src}/parcele_attr.csv", encoding="utf-8") as fh:
    for r in csv.DictReader(fh):
        attr[(int(r["KO_ID"]), r["ST_PARCELE"])] = (r["EID_PARCEL"], i(r["POVRSINA"]), pos(r["BONITETA"]), f2(r["E_CEN"]), f2(r["N_CEN"]))
print("parcel attrs", len(attr), flush=True)
batch = []
for x in feats(f"{src}/parcele.geojsonl"):
    pr, g = x["properties"], x.get("geometry")
    a = attr.pop((int(pr["KO_ID"]), pr["ST_PARCELE"]), None)
    if not g or not a:
        continue
    batch.append((int(pr["KO_ID"]), pr["ST_PARCELE"], json.dumps([pr["ST_PARCELE"], a[0], a[1], a[2], a[3], a[4], enc(g)], separators=(",", ":"))))
    if len(batch) >= 50000:
        db.executemany("INSERT INTO p VALUES(?,?,?)", batch); batch = []
db.executemany("INSERT INTO p VALUES(?,?,?)", batch); batch = []
del attr
print("parcels staged", flush=True)

for x in feats(f"{src}/buildings.geojsonl"):
    batch.append((x["properties"]["ko"], x["properties"]["n"], json.dumps(enc(x["geometry"]), separators=(",", ":"))))
    if len(batch) >= 50000:
        db.executemany("INSERT INTO g VALUES(?,?,?)", batch); batch = []
db.executemany("INSERT INTO g VALUES(?,?,?)", batch); batch = []
db.execute("CREATE INDEX gi ON g(ko, n)")
print("outlines staged", flush=True)

with open(f"{src}/stavbe_full.csv", encoding="utf-8") as fh:
    for r in csv.DictReader(fh):
        ko, n = i(r["KO_ID"]), i(r["ST_STAVBE"])
        if not ko or not n:
            continue
        row = [n, r["EID_STAVBA"], pos(r["STEVILO_ET"]), i(r["STEVILO_ST"]), i(r["STEVILO_PO"]), pos(r["LETO_IZGRA"]), pos(r["LETO_OBNO0"]),
               i(r["TIP_STAVBE"]), i(r["NOSILNA_KO"]), YES.get(i(r["ELEKTRIKA"])), YES.get(i(r["VODOVOD"])), YES.get(i(r["KANALIZACI"])), YES.get(i(r["PLIN"])),
               f2(r["X"]), f2(r["Y"])]
        batch.append((ko, n, r["EID_STAVBA"], json.dumps(row, separators=(",", ":"))))
db.executemany("INSERT INTO b VALUES(?,?,?,?)", batch); batch = []
db.execute("CREATE INDEX bi ON b(eid)")
print("buildings staged", flush=True)

(deli,) = glob.glob(f"{src}/KN_SLO_STAVBE_SLO_deli_stavb_*.csv")
with open(deli, encoding="utf-8") as fh:
    for r in csv.DictReader(fh):
        row = [i(r["ST_DELA_STAVBE"]), r["EID_DEL_STAVBE"], i(r["VRSTA_DEJANSKE_RABE_DEL_ST_ID"]), f2(r["POVRSINA"]), f2(r["UPORABNA_POVRSINA"]),
               YES.get(i(r["DVIGALO"])), YES.get(i(r["ETAZNA_LASTNINA"])), pos(r["ST_STANOVANJA"]), pos(r["LETO_OBNOVE_INSTALACIJ"]), pos(r["LETO_OBNOVE_OKEN"]),
               YES.get(i(r["SKUPNI_DEL_ETAZNA_LASTNINA"])), i(r["STATUS"]), i(r["NACIN_DOLOCITVE_POVRSINE_DELA_STAVBE_ID"]), pos(r["UPRAVNIK_ID"]), i(r["UPRAVNIK_STATUS"])]
        batch.append((r["EID_STAVBA"], json.dumps(row, separators=(",", ":"))))
        if len(batch) >= 50000:
            db.executemany("INSERT INTO d VALUES(?,?)", batch); batch = []
db.executemany("INSERT INTO d VALUES(?,?)", batch); batch = []
db.execute("CREATE INDEX di ON d(eidb)")
db.execute("CREATE INDEX pi ON p(ko)")
db.execute("CREATE INDEX bk ON b(ko)")
db.commit()
print("parts staged", flush=True)

(upr,) = glob.glob(f"{src}/KN_SLO_STAVBE_SLO_upravniki_*.csv")
with open(upr, encoding="utf-8") as fh:
    managers = {int(r["UPRAVNIK_ID"]): r["NAZIV"].strip() for r in csv.DictReader(fh)}
CODES = {"use": codes("VRSTE_DEJANSKIH_RAB_DEL_ST"), "type": codes("TIPI_STAVB"), "structure": codes("NOSILNE_KONSTRUKCIJE"),
         "status": codes("STATUSI_VPISA_DELA_STAVBE"), "areaMethod": codes("NACINI_DOLOCITVE_POVRSIN_DELA_STAVBE"), "mgrStatus": codes("STATUSI_UPRAVNIKOV")}

index = []
for x in feats(f"{src}/ko.geojsonl"):
    ko, name = int(x["properties"]["KO_ID"]), x["properties"]["NAZIV"].strip()
    xs, ys = [], []
    for poly in ([x["geometry"]["coordinates"]] if x["geometry"]["type"] == "Polygon" else x["geometry"]["coordinates"]):
        for ring in poly:
            xs += [c[0] for c in ring]; ys += [c[1] for c in ring]
    parcels = [json.loads(r) for (r,) in db.execute("SELECT row FROM p WHERE ko=?", (ko,))]
    geoms = dict(db.execute("SELECT n, geom FROM g WHERE ko=?", (ko,)))
    buildings, parts, used = [], {}, {}
    for eid, row in db.execute("SELECT eid, row FROM b WHERE ko=?", (ko,)):
        row = json.loads(row)
        g = geoms.get(row[0])
        if g is None:
            continue  # GURS STAVBE_OBRIS: buildings without outline are not shown either
        buildings.append(row + [json.loads(g)])
        ps = [json.loads(r) for (r,) in db.execute("SELECT row FROM d WHERE eidb=?", (eid,))]
        if ps:
            ps.sort(key=lambda p: p[0] or 0)
            parts[row[0]] = ps
            for p in ps:
                if p[13]:
                    used[p[13]] = managers.get(p[13], "")
    parcels.sort(key=lambda p: [int(s) if s.isdigit() else 0 for s in p[0].split("/")])
    buildings.sort(key=lambda b: b[0])
    doc = {"v": 1, "ko": [ko, name], "date": date, "src": SRC, "managers": used, "p": parcels, "b": buildings, "d": parts}
    with open(f"{out}/ko/{ko}.json", "w", encoding="utf-8") as fh:
        json.dump(doc, fh, separators=(",", ":"), ensure_ascii=False)
    index.append([ko, name, [round(min(xs), 5), round(min(ys), 5), round(max(xs), 5), round(max(ys), 5)], len(parcels), len(buildings)])
index.sort()
with open(f"{out}/ko/index.json", "w", encoding="utf-8") as fh:
    json.dump({"v": 1, "date": date, "src": SRC, "codes": CODES, "kos": index}, fh, separators=(",", ":"), ensure_ascii=False)
print("kos", len(index), flush=True)
