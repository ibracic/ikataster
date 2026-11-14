# Mirror file format (v1)

The weekly job (`scripts/mirror/build.sh`) turns GURS open data into static files under `/mirror` on ikataster.si.
The app reads them in `apps/web/src/mirror/data.ts`. Source: Geodetska uprava Republike Slovenije (CC BY 4.0).
Owner files (imetniki, osebe, pravice) are never used.

**Single source of truth:** `scripts/mirror/format.json` lists every key and positional field with its type.

- `kodata.py` writes `ko/<ko>.json` (`p` parcels, `b` buildings, `d` building parts per building) and `ko/index.json`.
- `extras.py` adds `pe` (parcel land use, intended use, buildings on the parcel) and `de` (part floors, entrance floor, address).
- `managers.py` and `addresses.py` write `mgr/` and `addr/` (search helpers).
- Geometry: list of polygons, polygon = list of rings, ring = flat delta-encoded ints of lon/lat × 1e6.
- Yes/no fields: 1 yes, 0 no, null unknown. Code fields are ids into `index.json` `codes`.

## Contract

1. `check_format.py <site>` validates `index.json` and a spread of KO files against `format.json`. `build.sh` runs it
   before the new site is swapped in, so a broken build never goes live.
2. `check_format.py <site> --sample 532 682 apps/web/src/mirror/__fixtures__/ko-532-682.json` writes a small real excerpt.
3. `apps/web/src/mirror/format.test.ts` checks that excerpt against `format.json` and decodes it with `decodeKo`.

Changing a field: update the Python writer, `format.json` and `decodeKo` together, bump `version` if old files can't be
read, regenerate the sample and run the tests.
