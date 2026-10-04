# iKataster valuation data

Generalised market values (*posplošena vrednost*) of parcels and building parts, one JSON file per cadastral municipality (KO), built from the public GURS dataset **Evidenca vrednotenja**.

- Source: GURS, Evidenca vrednotenja, licence [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Values only; no personal or ownership data.
- `index.json`: `{"date": dataset date, "kos": {"<ko>": [parcels, building parts]}}`
- `ko/<ko>.json`: `{"p": {"<parcel>": eur}, "d": {"<building>/<part>": eur}}` (parcel value is the sum of its valuation units)
- Rebuilt weekly by `scripts/valuations/build.py` on `main`; this branch is replaced by a single commit on each update.

Not an official source; for legal purposes check [vrednotenje.gov.si](https://vrednotenje.gov.si/).

## Transactions (`tx/`)

`tx/index.json` and `tx/ko/<ko>.json` hold sales (2007-) and rentals (2013-) from the GURS
*Evidenca trga nepremičnin* (ETN) open data, split per cadastral municipality.
Built by `scripts/transactions/build.py`; see its docstring for the file format.
The ETN open data contains no information on the parties to a deal.
