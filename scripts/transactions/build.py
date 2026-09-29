#!/usr/bin/env python3
"""
Build per-cadastral-municipality (KO) real-estate transaction files from the public
GURS "Evidenca trga nepremičnin" (ETN) open data: sales (KPP, 2007-) and rentals (NP, 2013-).

The ETN open-data export has no personal data (no parties); only deals, properties and prices.

Usage:
  build.py --out DIR [--cache DIR] [--from 2007]

Output:
  DIR/index.json      {"v":1,"source":...,"date":"YYYY-MM-DD","kos":{"<ko>":[sales parts, sales parcels, rent parts]}}
  DIR/ko/<ko>.json    {"v":1,"date":...,"ko":<ko>,
                       "s":{"<deal>":[date, price, kind, market, nParts, nParcels]},   sales deals
                       "sd":{"<bld>/<part>":[[deal, partPrice|null, area|null, type, share, floor]]},
                       "sp":{"<parcel>":[[deal, parcelPrice|null, area|null, landType, share]]},
                       "r":{"<deal>":[date, rent, kind, market, start, end]},       rental deals
                       "rd":{"<bld>/<part>":[[deal, rent|null, area|null, type]]}}
Dates are YYYY-MM-DD; kind/market/type/landType are GURS code numbers (see app i18n).
"""
import argparse, csv, io, json, os, re, shutil, sys, tempfile, time, urllib.request, zipfile
from collections import defaultdict

API = "https://ipi.eprostor.gov.si/jgp-service-api/display-views/groups/127/composite-products/{id}/file?filterParam=DRZAVA&filterValue=1&filterYear={y}"
SALES, RENTS = 321, 322
UA = {"User-Agent": "ikataster-transactions/1"}
SOURCE = "GURS, Evidenca trga nepremičnin (CC BY 4.0)"


def fetch_year(pid: int, year: int, cache: str, offline: bool = False) -> str | None:
    path = os.path.join(cache, f"{pid}-{year}.zip")
    if offline:
        return path if os.path.exists(path) and os.path.getsize(path) > 1000 else None
    try:
        with urllib.request.urlopen(urllib.request.Request(API.format(id=pid, y=year), headers=UA), timeout=60) as r:
            url = json.load(r).get("url")
        if not url:
            return None
        tmp = path + ".part"
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=600) as r, open(tmp, "wb") as f:
            shutil.copyfileobj(r, f, 1 << 20)
        if os.path.getsize(tmp) < 1000 or not zipfile.is_zipfile(tmp):
            os.remove(tmp)
            return None
        os.replace(tmp, path)
    except Exception as e:  # keep an older cached copy if the download fails
        print(f"warn: {pid}/{year}: {e}", file=sys.stderr)
    return path if os.path.exists(path) else None


def rows(z: zipfile.ZipFile, suffix: str):
    names = [n for n in z.namelist() if n.upper().endswith(suffix.upper()) or re.search(rf"_{suffix}_\d{{8}}\.csv$", n, re.I)]
    for n in names:
        with z.open(n) as f:
            yield from csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig", newline=""))


def day(s: str) -> str:
    m = re.match(r"(\d{1,2})\.(\d{1,2})\.(\d{4})", s or "")
    return f"{m[3]}-{int(m[2]):02d}-{int(m[1]):02d}" if m else ""


def num(s: str):
    try:
        v = float((s or "").replace(",", "."))
    except ValueError:
        return None
    return int(v) if v == int(v) else round(v, 2)


def code(s: str):
    m = re.match(r"\s*(\d+)", s or "")
    return int(m[1]) if m else None


def build(cache: str, out: str, first: int, offline: bool = False) -> dict:
    last = time.localtime().tm_year
    data = defaultdict(lambda: {"s": {}, "sd": defaultdict(list), "sp": defaultdict(list), "r": {}, "rd": defaultdict(list)})
    dates = []
    for y in range(first, last + 1):
        p = fetch_year(SALES, y, cache, offline)
        if p:
            z = zipfile.ZipFile(p)
            dates += re.findall(r"_(\d{8})\.csv", " ".join(z.namelist()))
            deals, counts = {}, defaultdict(lambda: [0, 0])
            for r in rows(z, "KPP_POSLI"):
                deals[r["ID_POSLA"]] = [day(r["DATUM_SKLENITVE_POGODBE"]) or day(r["DATUM_UVELJAVITVE"]), num(r["POGODBENA_CENA_ODSKODNINA"]),
                                        code(r["VRSTA_KUPOPRODAJNEGA_POSLA"]), code(r["TRZNOST_POSLA"])]
            for r in rows(z, "KPP_DELISTAVB"):
                ko, d = r["SIFRA_KO"], r["ID_POSLA"]
                if not ko or not r["STEVILKA_STAVBE"] or not r["STEVILKA_DELA_STAVBE"] or d not in deals:
                    continue
                counts[d][0] += 1
                data[ko]["sd"][f"{r['STEVILKA_STAVBE']}/{r['STEVILKA_DELA_STAVBE']}"].append(
                    [int(d), num(r["POGODBENA_CENA_DELA_STAVBE"]), num(r["PRODANA_UPORABNA_POVRSINA_DELA_STAVBE"]) or num(r["UPORABNA_POVRSINA"]) or num(r["PRODANA_POVRSINA"]),
                     code(r["VRSTA_DELA_STAVBE"]), r["PRODANI_DELEZ_DELA_STAVBE"] or "", r["NADSTROPJE_DELA_STAVBE"] or ""])
                data[ko]["s"][d] = deals[d]
            for r in rows(z, "KPP_ZEMLJISCA"):
                ko, d = r["SIFRA_KO"], r["ID_POSLA"]
                if not ko or not r["PARCELNA_STEVILKA"] or d not in deals:
                    continue
                counts[d][1] += 1
                data[ko]["sp"][r["PARCELNA_STEVILKA"]].append(
                    [int(d), num(r["POGODBENA_CENA_PARCELE"]), num(r["POVRSINA_PARCELE"]), code(r["VRSTA_ZEMLJISCA"]), r["PRODANI_DELEZ_PARCELE"] or ""])
                data[ko]["s"][d] = deals[d]
            for ko in data:
                for d, v in data[ko]["s"].items():
                    if len(v) == 4 and d in counts:
                        v += counts[d]
        p = fetch_year(RENTS, y, cache, offline) if y >= 2013 else None
        if p:
            z = zipfile.ZipFile(p)
            deals = {}
            for r in rows(z, "NP_POSLI"):
                deals[r["ID_POSLA"]] = [day(r["DATUM_SKLENITVE_POGODBE"]) or day(r["DATUM_UVELJAVITVE"]), num(r["POGODBENA_NAJEMNINA"]),
                                        code(r["VRSTA_NAJEMNEGA_POSLA"]), code(r["TRZNOST_POSLA"]), day(r["DATUM_ZACETKA_NAJEMA"]), day(r["DATUM_PRENEHANJA_NAJEMA"])]
            for r in rows(z, "NP_DELISTAVB"):
                ko, d = r["SIFRA_KO"], r["ID_POSLA"]
                if not ko or not r["STEVILKA_STAVBE"] or not r["STEVILKA_DELA_STAVBE"] or d not in deals:
                    continue
                data[ko]["rd"][f"{r['STEVILKA_STAVBE']}/{r['STEVILKA_DELA_STAVBE']}"].append(
                    [int(d), num(r["POGODBENA_NAJEMNINA_POSAMEZNIH_ODDANIH_PROSTOROV"]),
                     num(r["UPORABNA_POVRSINA_ODDANIH_PROSTOROV"]) or num(r["POVRSINA_ODDANIH_PROSTOROV"]), code(r["VRSTA_ODDANIH_PROSTOROV"])])
                data[ko]["r"][d] = deals[d]
        print(f"{y}: {len(data)} KOs so far", file=sys.stderr)

    date = max(dates) if dates else time.strftime("%Y%m%d")
    date = f"{date[:4]}-{date[4:6]}-{date[6:]}"
    tmp = tempfile.mkdtemp(dir=os.path.dirname(os.path.abspath(out)) or ".")
    os.makedirs(os.path.join(tmp, "ko"))
    kos = {}
    for ko in sorted(data, key=int):
        x = data[ko]
        for k in ("sd", "sp", "rd"):  # a deal can be re-published in a later year's file
            for key, lst in x[k].items():
                seen, uniq = set(), []
                for row in lst:
                    t = json.dumps(row)
                    if t not in seen:
                        seen.add(t); uniq.append(row)
                x[k][key] = sorted(uniq, key=lambda row: (x["s" if k != "rd" else "r"].get(str(row[0]), [""])[0]), reverse=True)
        doc = {"v": 1, "date": date, "ko": int(ko), **{k: dict(v) for k, v in x.items()}}
        with open(os.path.join(tmp, "ko", f"{int(ko)}.json"), "w") as f:
            json.dump(doc, f, separators=(",", ":"), ensure_ascii=False)
        kos[str(int(ko))] = [len(x["sd"]), len(x["sp"]), len(x["rd"])]
    with open(os.path.join(tmp, "index.json"), "w") as f:
        json.dump({"v": 1, "source": SOURCE, "date": date, "kos": kos}, f, separators=(",", ":"))
    if os.path.exists(out):
        shutil.rmtree(out)
    os.rename(tmp, out)
    return {"date": date, "kos": kos}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--cache", default=os.path.join(tempfile.gettempdir(), "etn-cache"))
    ap.add_argument("--from", dest="first", type=int, default=2007)
    ap.add_argument("--offline", action="store_true", help="use only cached zips")
    a = ap.parse_args()
    os.makedirs(a.cache, exist_ok=True)
    t = time.time()
    idx = build(a.cache, a.out, a.first, a.offline)
    print(f"{idx['date']}: {len(idx['kos'])} KOs in {time.time() - t:.0f}s", file=sys.stderr)


if __name__ == "__main__":
    main()
