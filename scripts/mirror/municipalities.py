#!/usr/bin/env python3
"""municipalities.py <parcele_x_rpe_obcine.csv> <register_naslovov.csv> <site> [ko...]

Adds the municipality (občina) of every parcel to the KO files:
  "ob": [names, most parcels first]   "po": {parcel: index}  (only parcels NOT in ob[0])
Names come from the address register (EID_OBCINA -> OBCINA_NAZIV)."""
import collections, csv, json, os, sys

def main(rpe, rn, site, only):
    names = {}
    with open(rn, encoding="utf-8") as fh:
        for r in csv.DictReader(fh): names[int(r["EID_OBCINA"])] = r["OBCINA_NAZIV"]
    of = {}
    with open(rpe, encoding="utf-8") as fh:
        rd = csv.reader(fh); h = next(rd); ip, io = h.index("EID_PARCELA"), h.index("EID_OBCINA")
        for r in rd: of[int(r[ip])] = int(r[io])
    ko_dir, total, hit, split = f"{site}/ko", 0, 0, 0
    for f in sorted(os.listdir(ko_dir)):
        if f == "index.json" or not f.endswith(".json"): continue
        if only and f[:-5] not in only: continue
        path = f"{ko_dir}/{f}"
        with open(path, encoding="utf-8") as fh: doc = json.load(fh)
        per = {}
        for r in doc["p"]:
            total += 1
            o = of.get(int(r[1]))
            if o is None or o not in names: continue
            hit += 1; per[r[0]] = names[o]
        ob = [n for n, _ in collections.Counter(per.values()).most_common()]
        ix = {n: i for i, n in enumerate(ob)}
        doc["ob"], doc["po"] = ob, {p: ix[n] for p, n in per.items() if ix[n]}
        split += len(ob) > 1
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh: json.dump(doc, fh, separators=(",", ":"), ensure_ascii=False)
        os.replace(tmp, path)
    print(f"parcels {total}, with municipality {hit}, KOs in several municipalities {split}")

if __name__ == "__main__":
    if len(sys.argv) < 4: sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2], sys.argv[3], set(sys.argv[4:]) or None)
