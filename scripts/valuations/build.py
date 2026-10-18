#!/usr/bin/env python3
"""
Build per-cadastral-municipality (KO) mass-valuation files from the public GURS
"Evidenca vrednotenja" dataset (national CSV export, CC BY 4.0).

Only parcel and building-part values are kept. Owner files in the export
(oseba, imetnik_lastnistva, pravica_lastnistva, ...) are never read.

Usage:
  build.py --out DIR --zip FILE        # use an already downloaded national zip
  build.py --out DIR --zip-dl FILE     # download the national zip to FILE first

Output:
  DIR/index.json        {"v":1,"source":..., "date":"YYYY-MM-DD", "kos":{"<ko>":[parcels, parts]}}
  DIR/ko/<ko>.json      {"v":1,"date":..., "ko":<ko>, "p":{"<parcel>":eur}, "d":{"<building>/<part>":eur}}
"""
import argparse, csv, io, json, os, re, shutil, sys, tempfile, time, urllib.request, zipfile
from collections import defaultdict

API = "https://ipi.eprostor.gov.si/jgp-service-api/display-views/groups/361/composite-products/361/file?filterParam=DRZAVA&filterValue=1"
UA = {"User-Agent": "ikataster-valuations/1"}
SOURCE = "GURS, Evidenca vrednotenja (CC BY 4.0)"


def download(dest: str) -> None:
    with urllib.request.urlopen(urllib.request.Request(API, headers=UA), timeout=60) as r:
        url = json.load(r)["url"]
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=3600) as r, open(dest, "wb") as f:
        shutil.copyfileobj(r, f, 1 << 20)


def rows(z: zipfile.ZipFile, table: str):
    """Yield dict rows of EV_*_EVIDENCA_VREDNOTENJA_<table>_<date>.csv (exact table name)."""
    pat = re.compile(rf"EVIDENCA_VREDNOTENJA_{re.escape(table)}_\d{{8}}\.csv$")
    names = [n for n in z.namelist() if pat.search(n)]
    if len(names) != 1:
        raise SystemExit(f"expected one file for {table}, got {names}")
    with z.open(names[0]) as f:
        yield from csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig", newline=""))


def dataset_date(z: zipfile.ZipFile) -> str:
    m = re.search(r"_(\d{4})(\d{2})(\d{2})\.csv$", z.namelist()[0])
    return f"{m[1]}-{m[2]}-{m[3]}" if m else time.strftime("%Y-%m-%d")


def build(zip_path: str, out: str) -> dict:
    z = zipfile.ZipFile(zip_path)
    date = dataset_date(z)

    # Memory-bounded (runs on a Raspberry Pi): integer keys, value tables first,
    # then stream the identity tables and drop each lookup as soon as it is used.
    pv = {}
    for r in rows(z, "parc_enota"):  # a parcel can have several valuation units -> sum them
        v = r["POSPLOSENA_VREDNOST"]
        if v:
            e = int(r["EID_PARCELA"])
            pv[e] = pv.get(e, 0) + round(float(v))
    parcels = defaultdict(dict)
    for r in rows(z, "parcela"):
        v = pv.pop(int(r["EID_PARCELA"]), None)
        if v is not None:
            d = parcels[int(r["KO_SIFKO"])]
            d[r["PARCELA"]] = d.get(r["PARCELA"], 0) + v
    del pv

    dv = {}
    for r in rows(z, "del_stavbe_enota"):
        v = r["POSPLOSENA_VREDNOST"]
        if v:
            e = int(r["EID_DEL_STAVBE"])
            dv[e] = dv.get(e, 0) + round(float(v))
    building = {}
    for r in rows(z, "stavba"):
        building[int(r["EID_STAVBA"])] = (int(r["KO_SIFKO"]), sys.intern(r["STEV_ST"]))
    parts = defaultdict(dict)
    for r in rows(z, "del_stavbe"):
        v = dv.pop(int(r["EID_DEL_STAVBE"]), None)
        if v is None:
            continue
        b = building.get(int(r["EID_STAVBA"]))
        if b:
            parts[b[0]][f"{b[1]}/{r['STEV_DST']}"] = v
    del dv, building

    tmp = tempfile.mkdtemp(dir=os.path.dirname(os.path.abspath(out)) or ".")
    os.makedirs(os.path.join(tmp, "ko"))
    kos = {}
    for ko in sorted(set(parcels) | set(parts)):
        p, d = parcels.get(ko, {}), parts.get(ko, {})
        with open(os.path.join(tmp, "ko", f"{ko}.json"), "w") as f:
            json.dump({"v": 1, "date": date, "ko": ko, "p": p, "d": d}, f, separators=(",", ":"), ensure_ascii=False)
        kos[str(ko)] = [len(p), len(d)]
    index = {"v": 1, "source": SOURCE, "date": date, "kos": kos}
    with open(os.path.join(tmp, "index.json"), "w") as f:
        json.dump(index, f, separators=(",", ":"))
    if os.path.exists(out):
        shutil.rmtree(out)
    os.rename(tmp, out)
    return index


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--zip")
    g.add_argument("--zip-dl")
    a = ap.parse_args()
    zip_path = a.zip or a.zip_dl
    if a.zip_dl:
        download(zip_path)
    t = time.time()
    idx = build(zip_path, a.out)
    import resource
    print(f"peak RSS {resource.getrusage(resource.RUSAGE_SELF).ru_maxrss // 1024} MB", file=sys.stderr)
    n = sum(p + d for p, d in idx["kos"].values())
    print(f"{idx['date']}: {len(idx['kos'])} KOs, {n} values in {time.time() - t:.0f}s", file=sys.stderr)


if __name__ == "__main__":
    main()
