#!/usr/bin/env python3
"""Address search shards for the iKataster GURS mirror.

<out>/addr/<key>.json, key = first two letters of the normalised street (or settlement) name
(diacritics folded: č->c, š->s, ž->z, đ->d, ć->c; other chars dropped; "_" pads one-letter names).
Each file: {"v":1, "date", "src", "a": [[street, houseNo, postCode, postName, municipality, e, n, buildingEid]]}.
Source: Geodetska uprava Republike Slovenije, register naslovov (CC BY 4.0). One row per house number
(flat rows of the same house number are merged).
"""
import csv, glob, json, os, sys, unicodedata

src, out, date = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(f"{out}/addr", exist_ok=True)
SRC = f"Geodetska uprava Republike Slovenije, register naslovov, stanje {date}"


def fold(s):
    s = unicodedata.normalize("NFKD", s.lower().replace("đ", "d"))
    return "".join(c for c in s if c.isalnum() and not unicodedata.combining(c))


def key(name):
    k = fold(name)[:2]
    return (k + "_")[:2] if k else "__"


shards, seen = {}, set()
(path,) = glob.glob(f"{src}/RN_SLO_NASLOVI_register_naslovov_*.csv")
with open(path, encoding="utf-8") as fh:
    for r in csv.DictReader(fh):
        hid = r["EID_HISNA_STEVILKA"]
        if hid in seen:
            continue
        seen.add(hid)
        street = (r["ULICA_NAZIV"] or r["NASELJE_NAZIV"]).strip()
        try:
            e, n = round(float(r["E"]), 2), round(float(r["N"]), 2)
            pc = int(r["POSTNI_OKOLIS_SIFRA"])
        except ValueError:
            continue
        hs = f'{r["HS_STEVILKA"]}{r["HS_DODATEK"]}'.strip()
        row = [street, hs, pc, r["POSTNI_OKOLIS_NAZIV"].strip(), r["OBCINA_NAZIV"].strip(), e, n, r["EID_STAVBA"] or None]
        shards.setdefault(key(street), []).append(row)
for k, rows in shards.items():
    rows.sort(key=lambda x: (fold(x[0]), [int(t) if t.isdigit() else 0 for t in [x[1].rstrip("abcdefghijklmnopqrstuvwxyz")]], x[1]))
    with open(f"{out}/addr/{k}.json", "w", encoding="utf-8") as fh:
        json.dump({"v": 1, "date": date, "src": SRC, "a": rows}, fh, separators=(",", ":"), ensure_ascii=False)
print("addresses", len(seen), "shards", len(shards))
