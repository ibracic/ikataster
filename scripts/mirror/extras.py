#!/usr/bin/env python3
"""Add parcel and building-part details to the per-KO mirror files (run after kodata.py).

usage: extras.py <src> <site>
Inputs in <src>: KN_SLO_PARCELE_SLO_parcele_x_dejanske_rabe_*.csv, ..._namenske_rabe_*.csv,
KN_SLO_PARCELE_SLO_STAVBE_PARCELE_poligon.csv, KN_SLO_STAVBE_SLO_ETAZE_{poligon,NULL}.csv,
KN_SLO_STAVBE_SLO_ETAZE_X_DELI_STAVB_{poligon,NULL}.csv, KN_SLO_STAVBE_SLO_deli_stavb_*.csv,
RN_SLO_NASLOVI_register_naslovov_*.csv, sifranti/VRSTE_{DEJANSKE,NAMENSKE}_RABE.CSV.

Adds to <site>/ko/<ko>.json:
  "pe": {parcel: [[[landUseId, ...], share], ...], [[intendedUseId, share], ...], [[ko, building, area, eid], ...]]}
  "de": {building: [[part, floors "1,2", entranceFloor, address]]}
and to ko/index.json codes: "landUse" {id: name}, "intended" {id: [name, description]}.

Source: Geodetska uprava Republike Slovenije, kataster nepremičnin + register naslovov (CC BY 4.0).
Owner files (imetniki, osebe, pravice) are never read.
"""
import csv, glob, json, os, sqlite3, sys

csv.field_size_limit(1 << 30)
src, site = sys.argv[1], sys.argv[2]
ko_dir = f"{site}/ko"
LAND = ["KG", "PO", "ST", "IN", "IN1", "IN2", "IN3", "VZ", "NN"]


def one(pattern):
    (p,) = glob.glob(f"{src}/{pattern}")
    return p


def rows(pattern):
    for p in sorted(glob.glob(f"{src}/{pattern}")):
        with open(p, encoding="utf-8") as fh:
            yield from csv.DictReader(fh)


def i(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def codes(name, desc=False):
    with open(f"{src}/sifranti/{name}.CSV", encoding="utf-8") as f:
        return {int(r["id"]): ([r["nazivSl"].strip(), r["opisSl"].strip()] if desc else r["nazivSl"].strip())
                for r in csv.DictReader(f) if int(r["id"]) > 0}


db = sqlite3.connect(f"{site}/../extras.sqlite")
db.executescript("""
PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;
DROP TABLE IF EXISTS lu; DROP TABLE IF EXISTS iu; DROP TABLE IF EXISTS sp; DROP TABLE IF EXISTS et; DROP TABLE IF EXISTS ex;
CREATE TABLE lu(p TEXT, ids TEXT, share INT);
CREATE TABLE iu(p TEXT, id INT, share INT);
CREATE TABLE sp(p TEXT, b TEXT, area INT);
CREATE TABLE et(e TEXT PRIMARY KEY, nr INT);
CREATE TABLE ex(d TEXT, e TEXT, main INT);
""")


def bulk(sql, it):
    batch = []
    for r in it:
        batch.append(r)
        if len(batch) >= 50000:
            db.executemany(sql, batch); batch = []
    db.executemany(sql, batch)


bulk("INSERT INTO lu VALUES(?,?,?)", ((r["EID_PARCELA"], json.dumps([v for v in (i(r[f"{k}_VRSTA_DEJANSKE_RABE_ID"]) for k in LAND) if v]), i(r["DELEZ"]))
                                       for r in rows("KN_SLO_PARCELE_SLO_parcele_x_dejanske_rabe_*.csv")))
bulk("INSERT INTO iu VALUES(?,?,?)", ((r["EID_PARCELA"], i(r["VRSTA_NAMENSKE_RABE_ID"]), i(r["DELEZ"]))
                                       for r in rows("KN_SLO_PARCELE_SLO_parcele_x_namenske_rabe_*.csv")))
bulk("INSERT INTO sp VALUES(?,?,?)", ((r["EID_PARCEL"], r["EID_STAVB0"], i(r["POVRSINA"])) for r in rows("KN_SLO_PARCELE_SLO_STAVBE_PARCELE_poligon.csv")))
bulk("INSERT OR IGNORE INTO et VALUES(?,?)", ((r["EID_ETAZA"], i(r["STEVILKA_E"])) for r in rows("KN_SLO_STAVBE_SLO_ETAZE_[pN]*.csv")))
bulk("INSERT INTO ex VALUES(?,?,?)", ((r["EID_DEL_ST"], r["EID_ETAZA"], 1 if i(r["GLAVNI_VHO"]) == 1 else 0) for r in rows("KN_SLO_STAVBE_SLO_ETAZE_X_DELI_STAVB_*.csv")))
for t, c in (("lu", "p"), ("iu", "p"), ("sp", "p"), ("ex", "d")):
    db.execute(f"CREATE INDEX {t}i ON {t}({c})")
db.commit()
print("staged", flush=True)

# house number EID -> "Street 10 a, 2000 Place"
house = {}
for r in rows("RN_SLO_NASLOVI_register_naslovov_*.csv"):
    h = r["EID_HISNA_STEVILKA"]
    if h in house:
        continue
    street = (r["ULICA_NAZIV"] or r["NASELJE_NAZIV"]).strip()
    hs = " ".join(x for x in (r["HS_STEVILKA"].strip(), r["HS_DODATEK"].strip()) if x)
    house[h] = f"{street} {hs}, {r['POSTNI_OKOLIS_SIFRA']} {r['POSTNI_OKOLIS_NAZIV'].strip()}"
part_addr = {}
for r in rows("KN_SLO_STAVBE_SLO_deli_stavb_*.csv"):
    a = house.get(r["EID_HISNA_STEVILKA"])
    if a:
        flat = i(r["ST_STANOVANJA"])
        part_addr[r["EID_DEL_STAVBE"]] = f"{a}, stan. {flat}" if flat and flat > 0 else a
del house
print("addresses", len(part_addr), flush=True)

# building EID -> (ko, number), across all KO files
files = sorted(f for f in os.listdir(ko_dir) if f != "index.json")
bld = {}
for f in files:
    with open(f"{ko_dir}/{f}", encoding="utf-8") as fh:
        doc = json.load(fh)
    ko = doc["ko"][0]
    for b in doc["b"]:
        bld[b[1]] = (ko, b[0])
print("buildings", len(bld), flush=True)

np = nd = 0
for f in files:
    path = f"{ko_dir}/{f}"
    with open(path, encoding="utf-8") as fh:
        doc = json.load(fh)
    pe = {}
    for p in doc["p"]:
        eid = p[1]
        lu = [[json.loads(ids), s] for ids, s in db.execute("SELECT ids, share FROM lu WHERE p=?", (eid,))]
        iu = [[v, s] for v, s in db.execute("SELECT id, share FROM iu WHERE p=? AND id>0", (eid,))]
        sb = sorted({(*bld[b], a or 0, b) for b, a in db.execute("SELECT b, area FROM sp WHERE p=?", (eid,)) if b in bld})
        if lu or iu or sb:
            pe[p[0]] = [lu, iu, [list(x) for x in sb]]
    de = {}
    for b, parts in doc["d"].items():
        out = []
        for part in parts:
            fl = db.execute("SELECT et.nr, ex.main FROM ex JOIN et ON et.e = ex.e WHERE ex.d=? ORDER BY et.nr", (part[1],)).fetchall()
            floors = ",".join(str(n) for n in dict.fromkeys(n for n, _ in fl if n is not None))
            entrance = next((n for n, m in fl if m), None)
            addr = part_addr.get(part[1])
            if floors or entrance is not None or addr:
                out.append([part[0], floors or None, entrance, addr])
        if out:
            de[b] = out
    doc["pe"], doc["de"] = pe, de
    np += len(pe); nd += sum(len(v) for v in de.values())
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, separators=(",", ":"), ensure_ascii=False)
    os.replace(tmp, path)

idx_path = f"{ko_dir}/index.json"
with open(idx_path, encoding="utf-8") as fh:
    idx = json.load(fh)
idx["codes"]["landUse"] = codes("VRSTE_DEJANSKE_RABE")
idx["codes"]["intended"] = codes("VRSTE_NAMENSKE_RABE", desc=True)
with open(idx_path, "w", encoding="utf-8") as fh:
    json.dump(idx, fh, separators=(",", ":"), ensure_ascii=False)
db.close(); os.remove(f"{site}/../extras.sqlite")
print("parcels", np, "parts", nd, flush=True)
